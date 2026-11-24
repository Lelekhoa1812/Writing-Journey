require('dotenv').config();

const { LLM_CHAIN, SLM_CHAIN, VISION_CHAIN, getNimPool, loadNimKeys, resetNimPool } = require('../services/nimClient');

function unique(models) {
  return [...new Set(models)];
}

async function probeModel(pool, model) {
  const started = Date.now();
  try {
    const result = await pool.complete({
      role: model,
      system: 'Reply with one JSON object only.',
      user: 'Return {"ready":true,"modelHint":"ok"}.',
      json: true,
      timeoutMs: 90000,
    });
    return {
      model,
      ok: result.text.includes('ready'),
      servedBy: result.model,
      keySlot: result.keySlot,
      cachedTokens: result.cachedTokens,
      ms: Date.now() - started,
      chars: result.text.length,
    };
  } catch (error) {
    return {
      model,
      ok: false,
      ms: Date.now() - started,
      error: error.message,
    };
  }
}

async function probeTools(pool) {
  const started = Date.now();
  try {
    const result = await pool.complete({
      role: 'slm',
      system: 'Call count_words for the user text. Do not answer in prose first.',
      user: 'Count the words in: practice makes progress.',
      tools: [{
        name: 'count_words',
        description: 'Count words.',
        parameters: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
      }],
      timeoutMs: 90000,
    });
    return {
      check: 'tool_call',
      ok: result.toolCalls.some((call) => call.name === 'count_words'),
      tool: result.toolCalls[0]?.name || '',
      servedBy: result.model,
      keySlot: result.keySlot,
      ms: Date.now() - started,
    };
  } catch (error) {
    return { check: 'tool_call', ok: false, ms: Date.now() - started, error: error.message };
  }
}

async function main() {
  const keyCount = loadNimKeys().length;
  console.log(JSON.stringify({ provider: 'nvidia-nim', keyCount }));
  if (!keyCount) {
    console.error('No NVIDIA NIM keys are configured.');
    process.exit(1);
  }
  resetNimPool();
  const pool = getNimPool();
  const models = unique([...SLM_CHAIN, ...LLM_CHAIN, ...VISION_CHAIN]);
  const results = [];
  for (const model of models) {
    results.push(await probeModel(pool, model));
    console.log(JSON.stringify(results[results.length - 1]));
  }
  const tools = await probeTools(pool);
  console.log(JSON.stringify(tools));
  const failed = results.filter((item) => !item.ok).length + (tools.ok ? 0 : 1);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
