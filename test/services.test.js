const test = require('node:test');
const assert = require('node:assert/strict');

const { extractJson } = require('../services/jsonUtils');
const { calculateOverallScore, roundToHalf } = require('../services/score');
const { normalizeEndpoint, runJsonAgent } = require('../services/azureClient');
const { normalizeExaminer } = require('../services/validators');
const { evaluateWriting, generateQuestion } = require('../services/orchestrator');
const { chatAssistant } = require('../services/prompts');

test('chat prompt quotes the published PTE form limits', () => {
  const prompt = chatAssistant({ message: 'How long is a summary?', mode: 'PTE', part: '1' });
  assert.match(prompt.system, /5 to 75 words/);
  assert.match(prompt.system, /Do not invent a different word count/);
  assert.match(prompt.system, /Active mode: PTE/);
});

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

test('normalizeExaminer rounds IELTS to a half band', () => {
  const result = normalizeExaminer({
    criteria: {
      TR: { score: 6.3, reason: 'thin' },
      CC: { score: 6, reason: 'clear' },
      LR: { score: 6, reason: 'basic' },
      GR: { score: 6, reason: 'simple' },
    },
  }, 'IELTS');
  assert.equal(result.criteria.TR.score, 6.5);
});

test('runJsonAgent stops after the NIM pool is exhausted', async () => {
  let calls = 0;
  const error = new Error('NIM pool exhausted after 7 dispatches. Last status: 503.');
  error.code = 'nim_exhausted';
  const result = await runJsonAgent({
    client: {},
    model: 'llm',
    name: 'Pool Agent',
    system: 'system',
    user: 'user',
    fallback: { ok: false },
    callModel: async () => {
      calls += 1;
      throw error;
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.data.ok, false);
  assert.equal(result.trace.attempts, 1);
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
    '{"criteria":{"Content":{"score":4,"reason":"Relevant but not fully developed","evidence":["general example"],"nextStep":"add specifics"},"Form":{"score":2,"reason":"Within range","evidence":["240 words"],"nextStep":"keep structure"},"Development":{"score":4,"reason":"Clear paragraphs","evidence":["logical order"],"nextStep":"link ideas"},"Grammar":{"score":1,"reason":"Some errors","evidence":["article errors"],"nextStep":"proofread"},"LinguisticRange":{"score":4,"reason":"Adequate range","evidence":["some repetition"],"nextStep":"vary phrasing"},"Vocabulary":{"score":1,"reason":"Adequate words","evidence":["some repetition"],"nextStep":"vary wording"},"Spelling":{"score":2,"reason":"Spelling is consistent","evidence":["no misspelling"],"nextStep":"keep one convention"}}}',
    '{"diagnostics":[{"criterion":"Content","issue":"General support","rootCause":"No concrete evidence","whyItMatters":"Limits PTE content score","fixStrategy":"Add example"}],"ideaInsights":[],"cohesionMap":[]}',
    '{"correction":"A corrected PTE draft.","sentenceInsights":[],"vocabularyUpgrades":[],"grammarPatterns":[]}',
    '{"modelAnswer":"A target-score PTE essay.","modelAnswerNotes":["within range"]}',
    '{"practicePlan":[{"priority":1,"focus":"Content","drill":"write one specific example","successSignal":"example is concrete"}]}',
    '{"overview":"This is a mid-range PTE response.","targetBandGap":["content"],"topPriorities":["specific support"],"encouragement":"Keep going."}',
  ];
  let index = 0;
  const report = await evaluateWriting(
    { mode: 'PTE', targetScore: '65', part: '2', question: 'Do you agree?', answer: 'Technology helps students become independent learners. '.repeat(40) },
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
  assert.equal(report.score, 18);
  assert.equal(report.scoreScale.max, 26);
  assert.equal(report.Content, 4);
  assert.equal(report.Development, 4);
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

test('evaluateWriting sends a chart only to the analyzer', async () => {
  const seen = [];
  const responses = [
    '{"taskType":"Part 1","promptRequirements":["overview"],"userThesis":"Overview","paragraphMap":[],"constraints":[],"wordCount":1,"visualFacts":["Bus use rose."]}',
    '{"criteria":{"TR":{"score":6.3,"reason":"Overview is thin","evidence":["rose"],"nextStep":"group the trends"},"CC":{"score":6,"reason":"Order is clear","evidence":["paragraphs"],"nextStep":"link comparisons"},"LR":{"score":6,"reason":"Basic nouns","evidence":["rose"],"nextStep":"name the categories"},"GR":{"score":6,"reason":"Simple sentences","evidence":["rose"],"nextStep":"vary clauses"}}}',
    '{"diagnostics":[],"ideaInsights":[],"cohesionMap":[]}',
    '{"correction":"The corrected report.","sentenceInsights":[],"vocabularyUpgrades":[],"grammarPatterns":[]}',
    '{"modelAnswer":"A model report.","modelAnswerNotes":[]}',
    '{"practicePlan":[{"priority":1,"focus":"Overview","drill":"write one overview","successSignal":"the overview compares"}]}',
    '{"overview":"Add a clearer overview.","targetBandGap":["overview"],"topPriorities":["group the data"],"encouragement":"Keep going."}',
  ];
  let index = 0;
  await evaluateWriting(
    { band: '7.0', part: '1', question: 'The chart shows travel.', answer: 'Bus use rose.', image: 'data:image/png;base64,abc' },
    {
      client: {},
      callModel: async ({ images, model }) => {
        seen.push({ model, images: images?.length || 0 });
        return responses[index++];
      },
      model: 'llm',
      slm: 'slm',
    },
  );
  assert.deepEqual(seen.map((item) => item.images), [1, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(seen.map((item) => item.model), ['slm', 'llm', 'llm', 'llm', 'llm', 'slm', 'slm']);
});

test('a PTE content zero removes the other trait points', () => {
  const result = normalizeExaminer({
    criteria: {
      Content: { score: 0, reason: 'Off topic.' },
      Form: { score: 1, reason: 'One sentence.' },
      Grammar: { score: 2, reason: 'No errors.' },
      Vocabulary: { score: 2, reason: 'Precise words.' },
    },
  }, 'PTE', { part: '1' });
  assert.equal(result.criteria.Grammar.score, 0);
  assert.equal(result.criteria.Vocabulary.score, 0);
  assert.match(result.criteria.Grammar.reason, /Content is 0, so this trait adds no points/);
  assert.match(result.criteria.Grammar.reason, /No errors/);
});

test('a PTE summary with two sentences fails the form gate', async () => {
  const responses = [
    '{"taskType":"SWT","promptRequirements":["one sentence"],"userThesis":"Main idea","paragraphMap":[],"constraints":[],"wordCount":12,"visualFacts":[]}',
    '{"criteria":{"Content":{"score":70,"reason":"Relevant","evidence":["main idea"],"nextStep":"keep it"},"Form":{"score":80,"reason":"Looks fine","evidence":["words"],"nextStep":"keep it"},"Grammar":{"score":70,"reason":"Clear","evidence":["verbs"],"nextStep":"keep it"},"Vocabulary":{"score":70,"reason":"Clear","evidence":["nouns"],"nextStep":"keep it"},"Coherence":{"score":70,"reason":"Clear","evidence":["order"],"nextStep":"keep it"}}}',
    '{"diagnostics":[],"ideaInsights":[],"cohesionMap":[]}',
    '{"correction":"One sentence.","sentenceInsights":[],"vocabularyUpgrades":[],"grammarPatterns":[]}',
    '{"modelAnswer":"One sentence model.","modelAnswerNotes":[]}',
    '{"practicePlan":[{"priority":1,"focus":"Form","drill":"write one sentence","successSignal":"one sentence"}]}',
    '{"overview":"Use one sentence.","targetBandGap":["form"],"topPriorities":["one sentence"],"encouragement":"Try again."}',
  ];
  let index = 0;
  const report = await evaluateWriting(
    { mode: 'PTE', part: '1', targetScore: '65', question: 'Summarize.', answer: 'Libraries changed. Students still need quiet rooms.' },
    {
      client: {},
      callModel: async () => responses[index++],
      model: 'llm',
      slm: 'slm',
    },
  );
  assert.equal(report.Form, 0);
  assert.equal(report.score, 0);
  assert.match(report.criteria.Form.reason, /Form is 0/);
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
