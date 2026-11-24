const NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';

// NIM.md §2. Thinking stays off. The fast model serves short agents.
// The large model serves scoring and coaching. Vision serves chart images.
const LLM_CHAIN = Object.freeze([
  'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
  'poolside/laguna-xs-2.1',
  'z-ai/glm-5.3-flash',
]);

const SLM_CHAIN = Object.freeze([
  'poolside/laguna-xs-2.1',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'z-ai/glm-5.3-flash',
]);

const VISION_CHAIN = Object.freeze([
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'poolside/laguna-xs-2.1',
]);

const MAX_DISPATCH = 7;
const MAX_KEYS_PER_MODEL = 3;
const PER_MINUTE = 30;
const DEMOTE_MS = 120000;
const RETIRE_MS = 600000;
const KEY_SPLIT = /[,\s]+/;
const THINK_BLOCK = /<think>[\s\S]*?<\/think>/g;
const JSON_FENCE = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i;

let sharedPool = null;

function redactSecrets(value) {
  return String(value || '')
    .replace(/nvapi-[A-Za-z0-9_-]+/g, 'nvapi-[redacted]')
    .slice(0, 240);
}

function loadNimKeys(env = process.env) {
  const raw = [];
  const joined = env.NVIDIA_NIM_API_KEYS || '';
  if (joined) raw.push(...String(joined).split(KEY_SPLIT));
  for (let slot = 1; slot <= 9; slot += 1) {
    raw.push(env[`NVIDIA_NIM_API_KEY_${slot}`] || '');
  }
  return [...new Set(raw.map((key) => String(key).trim()).filter(Boolean))];
}

function classifyStatus(status) {
  if (status === 401 || status === 403) return 'retire';
  if (status === 404 || status === 410 || status === 413 || status === 503) return 'model';
  if (status === 400 || status === 422) return 'format';
  return 'key';
}

function coolMs(status) {
  if (status === 429 || status === 408 || status === 425) return 30000;
  if (status === 402) return 120000;
  if (status == null) return 30000;
  if (status >= 500) return 10000;
  return 10000;
}

function resolveChain(role, hasImages) {
  if (hasImages) return [...VISION_CHAIN];
  if (!role || role === 'llm') return [...LLM_CHAIN];
  if (role === 'slm') return [...SLM_CHAIN];
  return [role, ...LLM_CHAIN.filter((model) => model !== role)];
}

function cleanText(raw) {
  let text = String(raw || '').replace(THINK_BLOCK, '');
  if (text.includes('</think>')) text = text.split('</think>').pop();
  text = text.trim();
  const fenced = text.match(JSON_FENCE);
  return fenced ? fenced[1].trim() : text;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function accumulateToolDeltas(store, deltas) {
  deltas.forEach((delta) => {
    const index = Number.isInteger(delta.index) ? delta.index : store.size;
    const current = store.get(index) || { id: '', name: '', args: '' };
    if (delta.id) current.id = delta.id;
    const fn = delta.function || {};
    if (fn.name) current.name += fn.name;
    if (typeof fn.arguments === 'string') current.args += fn.arguments;
    store.set(index, current);
  });
}

function parseToolCalls(store) {
  return [...store.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([index, item]) => {
      if (!item.name) return null;
      try {
        const args = JSON.parse(item.args || '{}');
        if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
        return { id: item.id || `call_${index}`, name: item.name, arguments: args };
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
}

function messageToolCalls(message) {
  return (message?.tool_calls || []).map((call, index) => {
    const name = call.function?.name || call.name;
    if (!name) return null;
    let args = call.function?.arguments ?? call.arguments ?? {};
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch (error) {
        return null;
      }
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
    return { id: call.id || `call_${index}`, name, arguments: args };
  }).filter(Boolean);
}

async function readCompletion(result) {
  if (result && typeof result[Symbol.asyncIterator] === 'function') {
    let text = '';
    const tools = new Map();
    let finish = null;
    let usage = {};
    for await (const chunk of result) {
      const choice = chunk.choices?.[0];
      const delta = choice?.delta || {};
      if (typeof delta.content === 'string') text += delta.content;
      if (Array.isArray(delta.tool_calls)) accumulateToolDeltas(tools, delta.tool_calls);
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (chunk.usage) usage = chunk.usage;
    }
    return { text, toolCalls: parseToolCalls(tools), finish, usage };
  }

  const message = result?.choices?.[0]?.message || {};
  return {
    text: typeof message.content === 'string' ? message.content : '',
    toolCalls: messageToolCalls(message),
    finish: result?.choices?.[0]?.finish_reason || null,
    usage: result?.usage || {},
  };
}

function imageUrl(image) {
  if (typeof image !== 'string' || !image) return '';
  return image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
}

function buildMessages({ messages, system, user, images = [] }) {
  const list = Array.isArray(messages) && messages.length
    ? messages.map((item) => ({ ...item }))
    : [
      { role: 'system', content: system || '' },
      { role: 'user', content: user || '' },
    ];
  const urls = images.map(imageUrl).filter(Boolean);
  if (!urls.length) return list;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index].role === 'user' && typeof list[index].content === 'string') {
      list[index] = {
        role: 'user',
        content: [
          { type: 'text', text: list[index].content },
          ...urls.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      };
      break;
    }
  }
  return list;
}

function statusOf(error) {
  return error?.status || error?.statusCode || error?.response?.status || null;
}

class NimPool {
  constructor(keys, options = {}) {
    this.keys = [...keys];
    this.transport = options.transport || null;
    this.clients = this.transport ? [] : this.keys.map((apiKey) => {
      const OpenAI = require('openai');
      return new OpenAI({
        baseURL: NIM_BASE_URL,
        apiKey,
        timeout: 120000,
        maxRetries: 0,
      });
    });
    this.cooldown = new Map();
    this.retiredUntil = new Map();
    this.demotedUntil = new Map();
    this.windows = this.keys.map(() => []);
    this.lastCall = null;
  }

  static fromEnv(env = process.env) {
    const keys = loadNimKeys(env);
    if (!keys.length) {
      throw new Error('NVIDIA NIM keys are missing. Set NVIDIA_NIM_API_KEY_1 to NVIDIA_NIM_API_KEY_9.');
    }
    return new NimPool(keys);
  }

  orderModels(chain) {
    const now = Date.now();
    const ready = [];
    const demoted = [];
    chain.forEach((model) => {
      if ((this.demotedUntil.get(model) || 0) > now) demoted.push(model);
      else ready.push(model);
    });
    return [...ready, ...demoted];
  }

  rank(model) {
    const now = Date.now();
    const available = this.keys
      .map((_, index) => index)
      .filter((index) => (this.retiredUntil.get(index) || 0) <= now);
    return shuffle(available).sort((left, right) => {
      const leftCool = (this.cooldown.get(`${left}:${model}`) || 0) > now ? 1 : 0;
      const rightCool = (this.cooldown.get(`${right}:${model}`) || 0) > now ? 1 : 0;
      return leftCool - rightCool;
    });
  }

  pace(slot) {
    const now = Date.now();
    const recent = this.windows[slot].filter((stamp) => now - stamp < 60000);
    if (recent.length >= PER_MINUTE) {
      this.windows[slot] = recent;
      return false;
    }
    recent.push(now);
    this.windows[slot] = recent;
    return true;
  }

  cool(slot, model, waitMs) {
    this.cooldown.set(`${slot}:${model}`, Date.now() + waitMs);
  }

  demote(model) {
    this.demotedUntil.set(model, Date.now() + DEMOTE_MS);
  }

  buildBody({ model, messages, json, tools, role, maxTokens, temperature }) {
    const baseTokens = role === 'slm' ? 2048 : 8192;
    let tokens = maxTokens || baseTokens;
    if (String(model).includes('glm')) tokens = Math.max(tokens, 1024);
    const body = {
      model,
      messages,
      max_tokens: tokens,
      temperature: temperature ?? (tools?.length ? 0.3 : 0.2),
      stream: true,
      stream_options: { include_usage: true },
      chat_template_kwargs: { enable_thinking: false },
    };
    if (String(model).includes('glm')) body.reasoning_effort = 'low';
    if (tools?.length) {
      body.tools = tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.parameters || { type: 'object', properties: {} },
        },
      }));
      body.tool_choice = 'auto';
    } else if (json) {
      body.response_format = { type: 'json_object' };
    }
    return body;
  }

  async dispatch(slot, body, timeoutMs) {
    if (this.transport) return this.transport({ slot, body, timeoutMs });
    return this.clients[slot].chat.completions.create(body, {
      timeout: timeoutMs || 90000,
    });
  }

  async complete(request = {}) {
    const images = request.images || [];
    const chain = this.orderModels(resolveChain(request.role, images.length > 0));
    const messages = buildMessages({ ...request, images });
    let dispatched = 0;
    let lastStatus = 'none';

    for (const model of chain) {
      if (dispatched >= MAX_DISPATCH) break;
      const queue = this.rank(model);
      let tried = 0;
      let omitFormat = false;
      while (queue.length && dispatched < MAX_DISPATCH && tried < MAX_KEYS_PER_MODEL) {
        const slot = queue.shift();
        if (!this.pace(slot)) continue;
        dispatched += 1;
        tried += 1;
        const body = this.buildBody({
          model,
          messages,
          json: Boolean(request.json) && !omitFormat,
          tools: request.tools,
          role: request.role,
          maxTokens: request.maxTokens,
          temperature: request.temperature,
        });
        try {
          const parsed = await readCompletion(await this.dispatch(slot, body, request.timeoutMs));
          const text = cleanText(parsed.text);
          if (!text && !parsed.toolCalls.length) {
            lastStatus = 'empty';
            this.demote(model);
            break;
          }
          const cachedTokens = parsed.usage?.prompt_tokens_details?.cached_tokens ?? null;
          this.lastCall = {
            model,
            keySlot: slot + 1,
            cachedTokens,
            finish: parsed.finish,
          };
          return {
            text,
            toolCalls: parsed.toolCalls,
            model,
            keySlot: slot + 1,
            cachedTokens,
            finish: parsed.finish,
          };
        } catch (error) {
          const status = statusOf(error);
          lastStatus = status || 'transport';
          const kind = classifyStatus(status);
          if (kind === 'retire') {
            this.retiredUntil.set(slot, Date.now() + RETIRE_MS);
          } else if (kind === 'format' && request.json && !omitFormat) {
            omitFormat = true;
            queue.unshift(slot);
            tried -= 1;
          } else if (kind === 'model') {
            this.demote(model);
            this.cool(slot, model, coolMs(status));
            break;
          } else {
            this.cool(slot, model, coolMs(status));
          }
        }
      }
    }

    const error = new Error(`NIM pool exhausted after ${dispatched} dispatches. Last status: ${lastStatus}.`);
    error.code = 'nim_exhausted';
    throw error;
  }
}

function getNimPool() {
  if (!sharedPool) sharedPool = NimPool.fromEnv();
  return sharedPool;
}

function resetNimPool() {
  sharedPool = null;
}

async function runToolLoop({
  pool,
  messages,
  tools,
  execute,
  role = 'slm',
  timeoutMs,
  maxRounds = 3,
}) {
  const transcript = messages.map((item) => ({ ...item }));
  let last = null;
  for (let round = 0; round < maxRounds; round += 1) {
    last = await pool.complete({
      messages: transcript,
      tools: round < maxRounds - 1 ? tools : null,
      role,
      timeoutMs,
    });
    if (!last.toolCalls?.length) return last;
    transcript.push({
      role: 'assistant',
      content: last.text || '',
      tool_calls: last.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })),
    });
    for (const call of last.toolCalls) {
      let output = { error: 'unknown_tool' };
      try {
        if (execute) output = await execute(call.name, call.arguments || {});
      } catch (error) {
        output = { error: 'tool_failed' };
      }
      transcript.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(output).slice(0, 4000),
      });
    }
  }
  if (last?.text) return last;
  return {
    text: 'I could not finish that with the exam tools. Ask a shorter question.',
    model: last?.model || role,
    keySlot: last?.keySlot || null,
    cachedTokens: last?.cachedTokens ?? null,
    toolCalls: [],
  };
}

module.exports = {
  LLM_CHAIN,
  NIM_BASE_URL,
  SLM_CHAIN,
  VISION_CHAIN,
  NimPool,
  classifyStatus,
  cleanText,
  getNimPool,
  loadNimKeys,
  redactSecrets,
  resetNimPool,
  resolveChain,
  runToolLoop,
};
