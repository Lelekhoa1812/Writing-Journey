const prompts = require('./prompts');
const {
  normalizeAnalysis,
  normalizeCorrection,
  normalizeDiagnosis,
  normalizeExaminer,
  normalizeLearningPlan,
  normalizeModelAnswer,
  normalizeSynthesis,
} = require('./validators');
const { calculateOverallScore, CRITERIA, getWordCount, safeBand } = require('./score');
const { createAzureClient, runJsonAgent, runTextAgent } = require('./azureClient');

function getConfig(overrides = {}) {
  return {
    model: overrides.model || process.env.AZURE_AI_FOUNDRY_MODEL || 'gpt-5.4-mini',
    slm: overrides.slm || process.env.AZURE_AI_FOUNDRY_SLM || 'gpt-5-nano',
    timeoutMs: Number(overrides.timeoutMs || process.env.AZURE_AI_FOUNDRY_TIMEOUT_MS || 60000),
  };
}

function baseInput(payload) {
  return {
    band: payload.band || '7.0',
    part: payload.part || '2',
    question: payload.question || '',
    answer: payload.answer || '',
    image: payload.image || '',
  };
}

function fallbackAnalysis(input) {
  return {
    taskType: `IELTS Writing Part ${input.part}`,
    promptRequirements: input.question ? [input.question] : ['Answer the supplied IELTS prompt.'],
    userThesis: 'The thesis needs to be identified more clearly.',
    paragraphMap: input.answer.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => ({
      paragraph: index + 1,
      purpose: index === 0 ? 'Opening or overview' : 'Development paragraph',
      strength: paragraph.slice(0, 100),
      concern: 'Needs specialist analysis after retry failure.',
    })),
    constraints: [`Recommended minimum words: ${input.part === '2' ? 250 : 150}`],
    wordCount: getWordCount(input.answer),
  };
}

function fallbackExaminer() {
  return {
    criteria: Object.fromEntries(CRITERIA.map((key) => [key, {
      score: 0,
      reason: 'Scoring agent could not return validated JSON after retries.',
      evidence: [],
      nextStep: 'Try evaluation again, or review the diagnostic sections that did complete.',
    }])),
  };
}

function fallbackDiagnosis() {
  return {
    diagnostics: [{
      criterion: 'General',
      issue: 'Diagnosis unavailable',
      rootCause: 'The specialist response failed validation after retries.',
      whyItMatters: 'The app avoids showing unreliable model output as if it were verified feedback.',
      fixStrategy: 'Retry the evaluation to recover this section.',
    }],
    ideaInsights: [],
    cohesionMap: [],
  };
}

function fallbackCorrection() {
  return {
    correction: 'The correction specialist could not return validated feedback after retries.',
    sentenceInsights: [],
    vocabularyUpgrades: [],
    grammarPatterns: [],
  };
}

function fallbackModelAnswer() {
  return {
    modelAnswer: 'The model-answer specialist could not return validated JSON after retries.',
    modelAnswerNotes: [],
  };
}

function fallbackLearningPlan() {
  return {
    practicePlan: [{
      priority: 1,
      focus: 'Retry evaluation',
      drill: 'Run the evaluation again so the coaching plan can be generated from validated specialist output.',
      successSignal: 'The report includes specific drills tied to your own writing.',
    }],
  };
}

function fallbackSynthesis() {
  return {
    overview: 'Your answer was evaluated with partial specialist output because one or more agents failed validation after retries.',
    targetBandGap: ['Review the available criterion scores and correction notes.'],
    topPriorities: ['Retry the evaluation if any section is marked unavailable.'],
    encouragement: 'Focused revision still beats generic rewriting.',
  };
}

function flattenCriteria(examiner) {
  const output = {};
  CRITERIA.forEach((key) => {
    output[key] = safeBand(examiner.criteria[key]?.score);
    output[`${key}_reason`] = examiner.criteria[key]?.reason || '';
  });
  return output;
}

function buildLegacyCorrection(correction) {
  if (correction.correction) return correction.correction;
  return correction.sentenceInsights
    .map((item) => `${item.original}\n${item.revised}`)
    .filter(Boolean)
    .join('\n\n');
}

function makeAgentRunner(client, config, callModel) {
  return (agentPrompt, model, validate, fallback, images = []) => runJsonAgent({
    client,
    model,
    name: agentPrompt.name,
    system: agentPrompt.system,
    user: agentPrompt.user,
    validate,
    fallback,
    images,
    timeoutMs: config.timeoutMs,
    callModel,
  });
}

async function evaluateWriting(payload, options = {}) {
  const config = getConfig(options);
  const client = options.client || createAzureClient(options);
  const callModel = options.callModel;
  const input = baseInput(payload);
  const runAgent = makeAgentRunner(client, config, callModel);
  const traces = [];

  // Motivation vs Logic: specialist agents make feedback deeper by separating examiner judgement,
  // diagnosis, correction, modelling, and practice planning; the orchestrator keeps their JSON
  // contracts explicit so the UI can teach from structured evidence instead of free-form blobs.
  const analysisPrompt = prompts.inputAnalyzer(input);
  const images = input.image ? [input.image] : [];
  const analysisResult = await runAgent(analysisPrompt, config.slm, normalizeAnalysis, () => fallbackAnalysis(input), images);
  traces.push(analysisResult.trace);
  const withAnalysis = { ...input, analysis: analysisResult.data };

  const [examinerResult, diagnosisResult, correctionResult, modelAnswerResult] = await Promise.all([
    runAgent(prompts.examiner(withAnalysis), config.model, normalizeExaminer, fallbackExaminer, images),
    runAgent(prompts.diagnosis(withAnalysis), config.model, normalizeDiagnosis, fallbackDiagnosis, images),
    runAgent(prompts.correction(withAnalysis), config.model, normalizeCorrection, fallbackCorrection, images),
    runAgent(prompts.modelAnswer(withAnalysis), config.model, normalizeModelAnswer, fallbackModelAnswer, images),
  ]);
  traces.push(examinerResult.trace, diagnosisResult.trace, correctionResult.trace, modelAnswerResult.trace);

  const learningInput = {
    ...withAnalysis,
    examiner: examinerResult.data,
    diagnosis: diagnosisResult.data,
  };
  const learningResult = await runAgent(prompts.learningPlan(learningInput), config.slm, normalizeLearningPlan, fallbackLearningPlan);
  traces.push(learningResult.trace);

  const synthesisInput = {
    ...withAnalysis,
    examiner: examinerResult.data,
    diagnosis: diagnosisResult.data,
    correction: correctionResult.data,
    learningPlan: learningResult.data,
  };
  const synthesisResult = await runAgent(prompts.synthesis(synthesisInput), config.model, normalizeSynthesis, fallbackSynthesis);
  traces.push(synthesisResult.trace);

  const flatCriteria = flattenCriteria(examinerResult.data);
  const score = calculateOverallScore(flatCriteria);

  return {
    score,
    ...flatCriteria,
    correction: buildLegacyCorrection(correctionResult.data),
    modelAnswer: modelAnswerResult.data.modelAnswer,
    overview: synthesisResult.data.overview,
    criteria: examinerResult.data.criteria,
    diagnostics: diagnosisResult.data.diagnostics,
    sentenceInsights: correctionResult.data.sentenceInsights,
    ideaInsights: diagnosisResult.data.ideaInsights,
    cohesionMap: diagnosisResult.data.cohesionMap,
    vocabularyUpgrades: correctionResult.data.vocabularyUpgrades,
    grammarPatterns: correctionResult.data.grammarPatterns,
    modelAnswerNotes: modelAnswerResult.data.modelAnswerNotes,
    practicePlan: learningResult.data.practicePlan,
    targetBandGap: synthesisResult.data.targetBandGap,
    topPriorities: synthesisResult.data.topPriorities,
    encouragement: synthesisResult.data.encouragement,
    analysis: analysisResult.data,
    agentTraceSummary: traces,
  };
}

async function assistChat(payload, options = {}) {
  const config = getConfig(options);
  const client = options.client || createAzureClient(options);
  const prompt = prompts.chatAssistant({
    message: payload.message || '',
    evaluationContext: payload.evaluationContext || null,
  });
  const result = await runTextAgent({
    client,
    model: config.slm,
    name: prompt.name,
    system: prompt.system,
    user: prompt.user,
    fallback: 'I could not get a reliable response after several attempts. Please try again with a shorter question.',
    timeoutMs: config.timeoutMs,
    callModel: options.callModel,
  });
  return { reply: result.data, agentTraceSummary: [result.trace] };
}

module.exports = {
  assistChat,
  evaluateWriting,
  fallbackAnalysis,
};
