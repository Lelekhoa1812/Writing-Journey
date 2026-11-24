const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LLM_CHAIN,
  SLM_CHAIN,
  VISION_CHAIN,
  NimPool,
  classifyStatus,
  cleanText,
  loadNimKeys,
  redactSecrets,
} = require('../services/nimClient');
const { assistChat } = require('../services/orchestrator');

function reply(text, extra = {}) {
  return {
    choices: [{ message: { content: text, ...extra }, finish_reason: 'stop' }],
    usage: { prompt_tokens_details: { cached_tokens: 12 } },
  };
}

function fail(status, message = 'upstream') {
  const error = new Error(message);
  error.status = status;
  return error;
}

test('loadNimKeys keeps joined keys first and drops duplicates', () => {
  const keys = loadNimKeys({
    NVIDIA_NIM_API_KEYS: 'nvapi-a, nvapi-b',
    NVIDIA_NIM_API_KEY_1: 'nvapi-a',
    NVIDIA_NIM_API_KEY_2: 'nvapi-c',
    NVIDIA_NIM_API_KEY_3: '   ',
  });
  assert.deepEqual(keys, ['nvapi-a', 'nvapi-b', 'nvapi-c']);
});

test('redactSecrets hides NVIDIA key material', () => {
  assert.equal(redactSecrets('rejected nvapi-secretvalue now'), 'rejected nvapi-[redacted] now');
});

test('classifyStatus matches the NIM failure matrix', () => {
  assert.equal(classifyStatus(401), 'retire');
  assert.equal(classifyStatus(403), 'retire');
  assert.equal(classifyStatus(429), 'key');
  assert.equal(classifyStatus(404), 'model');
  assert.equal(classifyStatus(503), 'model');
  assert.equal(classifyStatus(400), 'format');
});

test('cleanText drops think blocks and one json fence', () => {
  assert.equal(cleanText('<think>hidden</think>\n```json\n{"ok":true}\n```'), '{"ok":true}');
});

test('a 429 rotates to the next key on the same model', async () => {
  const seen = [];
  const pool = new NimPool(['k1', 'k2'], {
    transport: async ({ slot, body }) => {
      seen.push({ slot, model: body.model, stream: body.stream, thinking: body.chat_template_kwargs.enable_thinking });
      if (seen.length === 1) throw fail(429);
      return reply('scored');
    },
  });
  const result = await pool.complete({ role: 'llm', system: 'system', user: 'user' });
  assert.equal(result.text, 'scored');
  assert.equal(result.cachedTokens, 12);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].model, LLM_CHAIN[0]);
  assert.equal(seen[1].model, LLM_CHAIN[0]);
  assert.equal(seen[1].stream, true);
  assert.equal(seen[1].thinking, false);
  assert.notEqual(seen[0].slot, seen[1].slot);
  assert.equal(result.keySlot, seen[1].slot + 1);
});

test('a 404 demotes the model and uses the next model', async () => {
  const models = [];
  const pool = new NimPool(['k1'], {
    transport: async ({ body }) => {
      models.push(body.model);
      if (body.model === LLM_CHAIN[0]) throw fail(404);
      return reply('fallback');
    },
  });
  const result = await pool.complete({ role: 'llm', system: 'system', user: 'user' });
  assert.equal(result.model, LLM_CHAIN[1]);
  assert.deepEqual(models.slice(0, 2), [LLM_CHAIN[0], LLM_CHAIN[1]]);
});

test('json mode asks for json_object and falls back after a format rejection', async () => {
  const formats = [];
  const pool = new NimPool(['k1'], {
    transport: async ({ body }) => {
      formats.push(body.response_format?.type || 'none');
      if (body.response_format) throw fail(400);
      return reply('{"ok":true}');
    },
  });
  const result = await pool.complete({ role: 'slm', system: 'system', user: 'user', json: true });
  assert.equal(result.model, SLM_CHAIN[0]);
  assert.deepEqual(formats, ['json_object', 'none']);
});

test('GLM requests low reasoning effort', async () => {
  const pool = new NimPool(['k1'], {
    transport: async ({ body }) => {
      assert.equal(body.model, 'z-ai/glm-5.3-flash');
      assert.equal(body.reasoning_effort, 'low');
      assert.ok(body.max_tokens >= 1024);
      return reply('ready');
    },
  });
  const result = await pool.complete({
    role: 'z-ai/glm-5.3-flash',
    system: 'system',
    user: 'user',
  });
  assert.equal(result.text, 'ready');
});

test('images select the vision model first', async () => {
  const pool = new NimPool(['k1'], {
    transport: async ({ body }) => {
      assert.equal(body.model, VISION_CHAIN[0]);
      const user = body.messages.find((item) => item.role === 'user');
      assert.equal(user.content[1].type, 'image_url');
      return reply('chart');
    },
  });
  const result = await pool.complete({
    role: 'llm',
    system: 'system',
    user: 'describe',
    images: ['abc'],
  });
  assert.equal(result.text, 'chart');
});

test('a paced key is not dispatched', async () => {
  let calls = 0;
  const pool = new NimPool(['k1'], {
    transport: async () => {
      calls += 1;
      return reply('no');
    },
  });
  pool.windows[0] = Array.from({ length: 30 }, () => Date.now());
  await assert.rejects(
    () => pool.complete({ role: 'slm', system: 'system', user: 'user' }),
    /NIM pool exhausted/,
  );
  assert.equal(calls, 0);
});

test('errors do not reveal key material', async () => {
  const pool = new NimPool(['nvapi-secretvalue'], {
    transport: async () => {
      throw fail(500, 'bad nvapi-secretvalue');
    },
  });
  await assert.rejects(
    () => pool.complete({ role: 'slm', system: 'system', user: 'user' }),
    (error) => {
      assert.equal(error.message.includes('nvapi-secretvalue'), false);
      assert.match(error.message, /exhausted/);
      return true;
    },
  );
});

test('assistChat runs a tool and then returns the model answer', async () => {
  let calls = 0;
  const client = {
    async complete(request) {
      calls += 1;
      if (calls === 1) {
        return {
          text: '',
          toolCalls: [{ id: 'call_1', name: 'count_words', arguments: { text: 'one two three' } }],
          model: SLM_CHAIN[0],
          keySlot: 1,
          cachedTokens: 4,
        };
      }
      const toolMessage = request.messages.find((item) => item.role === 'tool');
      assert.match(toolMessage.content, /"words":3/);
      return {
        text: 'The draft has 3 words.',
        toolCalls: [],
        model: SLM_CHAIN[0],
        keySlot: 1,
        cachedTokens: 4,
      };
    },
  };
  const result = await assistChat(
    { message: 'How many words?', evaluationContext: { mode: 'IELTS', score: 6.5, overview: 'Clear.' } },
    { client },
  );
  assert.equal(calls, 2);
  assert.equal(result.reply, 'The draft has 3 words.');
  assert.equal(result.agentTraceSummary[0].keySlot, 1);
});
