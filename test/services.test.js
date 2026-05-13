const test = require('node:test');
const assert = require('node:assert/strict');

const { extractJson } = require('../services/jsonUtils');
const { calculateOverallScore, roundToHalf } = require('../services/score');
const { normalizeEndpoint, runJsonAgent } = require('../services/azureClient');
const { evaluateWriting, generateQuestion } = require('../services/orchestrator');

test('extractJson handles fenced JSON and surrounding prose', () => {
  const parsed = extractJson('Here:\n```json\n{"TR":7,"CC":6.5,}\n```');
  assert.deepEqual(parsed, { TR: 7, CC: 6.5 });
});

test('score helpers round IELTS criteria to nearest half band', () => {
  assert.equal(roundToHalf(6.74), 6.5);
  assert.equal(roundToHalf(6.76), 7);
  assert.equal(calculateOverallScore({ TR: 7, CC: 6.5, LR: 7, GR: 6 }), 6.5);
});

test('normalizeEndpoint appends OpenAI-compatible route once', () => {
  assert.equal(
    normalizeEndpoint('https://example.openai.azure.com'),
    'https://example.openai.azure.com/openai/v1',
  );
  assert.equal(
    normalizeEndpoint('https://example.openai.azure.com/openai/v1/'),
    'https://example.openai.azure.com/openai/v1',
  );
});

test('runJsonAgent retries malformed JSON up to success', async () => {
  let calls = 0;
  const result = await runJsonAgent({
    client: {},
    model: 'test-model',
    name: 'Retry Agent',
    system: 'system',
    user: 'user',
    validate: (value) => {
      if (!value.ok) throw new Error('bad shape');
      return value;
    },
    fallback: { ok: false },
    callModel: async () => {
      calls += 1;
      return calls < 3 ? '{ bad json' : '{"ok":true}';
    },
  });

  assert.equal(calls, 3);
  assert.equal(result.data.ok, true);
  assert.equal(result.trace.attempts, 3);
});

test('runJsonAgent returns controlled fallback after five failures', async () => {
  const result = await runJsonAgent({
    client: {},
    model: 'test-model',
    name: 'Failing Agent',
    system: 'system',
    user: 'user',
    fallback: { ok: false },
    callModel: async () => '{ nope',
  });

  assert.deepEqual(result.data, { ok: false });
  assert.equal(result.trace.attempts, 5);
  assert.equal(result.trace.ok, false);
});

test('evaluateWriting assembles a multi-agent report with mocked model responses', async () => {
  const responses = [
    '{"taskType":"Part 2 opinion essay","promptRequirements":["state opinion"],"userThesis":"Agree","paragraphMap":[{"paragraph":1,"purpose":"intro","strength":"clear","concern":"thin thesis"}],"constraints":["250 words"],"wordCount":260}',
    '{"criteria":{"TR":{"score":6.5,"reason":"Ideas need depth","evidence":["thin example"],"nextStep":"develop examples"},"CC":{"score":7,"reason":"Mostly logical","evidence":["clear paragraphs"],"nextStep":"sharpen links"},"LR":{"score":6.5,"reason":"Some awkward collocations","evidence":["make a damage"],"nextStep":"learn collocations"},"GR":{"score":6,"reason":"Sentence control varies","evidence":["agreement errors"],"nextStep":"proofread clauses"}}}',
    '{"diagnostics":[{"criterion":"TR","issue":"Underdeveloped example","rootCause":"Explains result, not cause","whyItMatters":"Limits depth","fixStrategy":"Add cause-effect chain"}],"ideaInsights":[{"originalIdea":"technology is good","problem":"too broad","deeperAlternative":"show one concrete learning benefit"}],"cohesionMap":[{"step":1,"role":"intro","linkQuality":"clear","improvement":"preview both reasons"}]}',
    '{"correction":"Your ~~make a damage~~ **cause harm**.","sentenceInsights":[{"sentenceNumber":1,"original":"make a damage","revised":"cause harm","issueType":"collocation","whyWrong":"unnatural phrase","principle":"use verb-noun collocations"}],"vocabularyUpgrades":[{"original":"good","upgrade":"beneficial","reason":"more academic"}],"grammarPatterns":[{"pattern":"articles","problem":"missing article","exampleFix":"a significant effect"}]}',
    '{"modelAnswer":"A target-band model answer.","modelAnswerNotes":["clear position"]}',
    '{"practicePlan":[{"priority":1,"focus":"Develop examples","drill":"write cause-effect chains","successSignal":"each idea has why and result"}]}',
    '{"overview":"You are close to band 7 but need deeper support.","targetBandGap":["depth"],"topPriorities":["examples"],"encouragement":"Good foundation."}',
  ];
  let index = 0;
  const report = await evaluateWriting(
    { band: '7.0', part: '2', question: 'Discuss both views.', answer: 'Technology is good for students.' },
    {
      client: {},
      callModel: async () => responses[index++],
      model: 'main',
      slm: 'small',
    },
  );

  assert.equal(report.score, 6.5);
  assert.equal(report.TR, 6.5);
  assert.equal(report.overview, 'You are close to band 7 but need deeper support.');
  assert.equal(report.sentenceInsights[0].issueType, 'collocation');
  assert.equal(report.agentTraceSummary.length, 7);
});

test('evaluateWriting supports PTE scoring and task context', async () => {
  const responses = [
    '{"taskType":"PTE Write Essay","promptRequirements":["answer the essay prompt"],"userThesis":"Agree","paragraphMap":[{"paragraph":1,"purpose":"intro","strength":"position","concern":"needs depth"}],"constraints":["200-300 words"],"wordCount":205}',
    '{"criteria":{"Content":{"score":65,"reason":"Relevant but not fully developed","evidence":["general example"],"nextStep":"add specifics"},"Form":{"score":80,"reason":"Within range","evidence":["205 words"],"nextStep":"keep structure"},"Grammar":{"score":62,"reason":"Some errors","evidence":["article errors"],"nextStep":"proofread"},"Vocabulary":{"score":68,"reason":"Adequate range","evidence":["some repetition"],"nextStep":"vary phrasing"},"Coherence":{"score":70,"reason":"Clear flow","evidence":["logical paragraphs"],"nextStep":"improve transitions"}}}',
    '{"diagnostics":[{"criterion":"Content","issue":"General support","rootCause":"No concrete evidence","whyItMatters":"Limits PTE content score","fixStrategy":"Add example"}],"ideaInsights":[],"cohesionMap":[]}',
    '{"correction":"A corrected PTE draft.","sentenceInsights":[],"vocabularyUpgrades":[],"grammarPatterns":[]}',
    '{"modelAnswer":"A target-score PTE essay.","modelAnswerNotes":["within range"]}',
    '{"practicePlan":[{"priority":1,"focus":"Content","drill":"write one specific example","successSignal":"example is concrete"}]}',
    '{"overview":"This is a mid-range PTE response.","targetBandGap":["content"],"topPriorities":["specific support"],"encouragement":"Keep going."}',
  ];
  let index = 0;
  const report = await evaluateWriting(
    { mode: 'PTE', targetScore: '65', part: '2', question: 'Do you agree?', answer: 'Technology helps students become independent learners. '.repeat(30) },
    {
      client: {},
      callModel: async () => responses[index++],
      model: 'main',
      slm: 'small',
    },
  );

  assert.equal(report.mode, 'PTE');
  assert.equal(report.targetScore, '65');
  assert.equal(report.taskLabel, 'Write Essay');
  assert.equal(report.score, 69);
  assert.equal(report.scoreScale.max, 90);
  assert.equal(report.Content, 65);
});

test('generateQuestion returns validated SLM question output', async () => {
  const generated = await generateQuestion(
    { mode: 'PTE', part: '1' },
    {
      client: {},
      slm: 'small',
      callModel: async () => '{"question":"Summarize the passage.","instructions":"Write one sentence.","sourceText":"A passage about renewable energy.","recommendedWords":"5-75 words in one sentence","timeMinutes":10}',
    },
  );

  assert.equal(generated.mode, 'PTE');
  assert.equal(generated.taskLabel, 'Summarize Written Text');
  assert.equal(generated.sourceText, 'A passage about renewable energy.');
  assert.equal(generated.agentTraceSummary[0].ok, true);
});

test('generateQuestion falls back after malformed SLM output', async () => {
  const generated = await generateQuestion(
    { mode: 'IELTS', part: '2' },
    {
      client: {},
      slm: 'small',
      callModel: async () => '{ nope',
    },
  );

  assert.equal(generated.mode, 'IELTS');
  assert.equal(generated.taskLabel, 'Part 2');
  assert.match(generated.question, /governments|people/i);
  assert.equal(generated.agentTraceSummary[0].ok, false);
});
