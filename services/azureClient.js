const OpenAI = require('openai');
const { extractJson } = require('./jsonUtils');

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_RETRIES = 5;

function normalizeEndpoint(endpoint = '') {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/openai/v1') ? trimmed : `${trimmed}/openai/v1`;
}

function createAzureClient(config = {}) {
  const endpoint = normalizeEndpoint(config.endpoint || process.env.AZURE_AI_FOUNDRY_ENDPOINT || '');
  const apiKey = config.apiKey || process.env.AZURE_AI_FOUNDRY_API_KEY;
  if (!endpoint || !apiKey) {
    throw new Error('Missing Azure AI Foundry endpoint or API key');
  }
  return new OpenAI({
    baseURL: endpoint,
    apiKey,
    timeout: Number(config.timeoutMs || process.env.AZURE_AI_FOUNDRY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    defaultHeaders: { 'api-key': apiKey },
  });
}

function getOutputText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  if (Array.isArray(response?.output)) {
    return response.output
      .flatMap((item) => item.content || [])
      .map((content) => content.text || content.output_text || '')
      .join('\n')
      .trim();
  }
  if (typeof response?.choices?.[0]?.message?.content === 'string') {
    return response.choices[0].message.content;
  }
  return '';
}

function buildUserContent(user, images = []) {
  const content = [{ type: 'input_text', text: user }];
  images.filter(Boolean).forEach((image) => {
    content.push({
      type: 'input_image',
      image_url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`,
    });
  });
  return content;
}

async function callTextModel({ client, model, system, user, images = [], timeoutMs }) {
  const request = {
    model,
    input: [
      { role: 'system', content: system },
      { role: 'user', content: buildUserContent(user, images) },
    ],
  };

  const response = await client.responses.create(request, timeoutMs ? { timeout: timeoutMs } : undefined);
  return getOutputText(response);
}

async function callChatModel({ client, model, system, user, timeoutMs }) {
  const request = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  const response = await client.chat.completions.create(request, timeoutMs ? { timeout: timeoutMs } : undefined);
  return getOutputText(response);
}

async function runJsonAgent({
  client,
  model,
  name,
  system,
  user,
  images,
  validate,
  fallback,
  maxRetries = DEFAULT_MAX_RETRIES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  callModel = callTextModel,
}) {
  let lastError = null;
  // Root Cause vs Logic: LLMs sometimes return prose, fenced JSON, or partial structures even
  // when prompted strictly; retrying the same agent contract up to five times prevents one
  // malformed specialist response from becoming an immediate user-facing failure.
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const retryInstruction = attempt === 1
        ? ''
        : `\n\nPrevious attempt failed validation. Return only valid JSON matching the requested shape. Attempt ${attempt} of ${maxRetries}.`;
      const raw = await callModel({
        client,
        model,
        system,
        user: `${user}${retryInstruction}`,
        images,
        timeoutMs,
      });
      const parsed = extractJson(raw);
      if (!parsed) throw new Error('No valid JSON object found');
      const normalized = validate ? validate(parsed) : parsed;
      return {
        data: normalized,
        trace: { name, model, attempts: attempt, ok: true },
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    data: typeof fallback === 'function' ? fallback(lastError) : fallback,
    trace: {
      name,
      model,
      attempts: maxRetries,
      ok: false,
      error: lastError?.message || 'Agent failed',
    },
  };
}

async function runTextAgent({
  client,
  model,
  name,
  system,
  user,
  fallback,
  maxRetries = DEFAULT_MAX_RETRIES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  callModel = callTextModel,
}) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const text = await callModel({ client, model, system, user, timeoutMs });
      if (text.trim()) {
        return { data: text.trim(), trace: { name, model, attempts: attempt, ok: true } };
      }
      throw new Error('Empty model response');
    } catch (error) {
      lastError = error;
    }
  }

  return {
    data: typeof fallback === 'function' ? fallback(lastError) : fallback,
    trace: {
      name,
      model,
      attempts: maxRetries,
      ok: false,
      error: lastError?.message || 'Agent failed',
    },
  };
}

module.exports = {
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  callChatModel,
  callTextModel,
  createAzureClient,
  getOutputText,
  normalizeEndpoint,
  runJsonAgent,
  runTextAgent,
};
