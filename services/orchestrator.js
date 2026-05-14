const prompts = require('./prompts');
const {
  normalizeAnalysis,
  normalizeCorrection,
  normalizeDiagnosis,
  normalizeExaminer,
  normalizeGeneratedQuestion,
  normalizeLearningPlan,
  normalizeModelAnswer,
  normalizeSynthesis,
} = require('./validators');
const { getExamConfig, getTaskConfig, normalizeMode } = require('./examConfig');
const { calculateModeScore, getWordCount, safeBand, safeScore } = require('./score');
const { createAzureClient, runJsonAgent, runTextAgent } = require('./azureClient');

function getConfig(overrides = {}) {
  return {
    model: overrides.model || process.env.AZURE_AI_FOUNDRY_MODEL || 'gpt-5.4-mini',
    slm: overrides.slm || process.env.AZURE_AI_FOUNDRY_SLM || 'gpt-5-nano',
    timeoutMs: Number(overrides.timeoutMs || process.env.AZURE_AI_FOUNDRY_TIMEOUT_MS || 60000),
  };
}

function baseInput(payload) {
  const mode = normalizeMode(payload.mode);
  const config = getExamConfig(mode);
  return {
    mode,
    targetScore: payload.targetScore || payload.band || config.defaultTarget,
    band: payload.band || (mode === 'IELTS' ? config.defaultTarget : ''),
    part: payload.part || '2',
    question: payload.question || '',
    answer: payload.answer || '',
    image: payload.image || '',
  };
}

function fallbackAnalysis(input) {
  const task = getTaskConfig(input.mode, input.part);
  return {
    taskType: task.promptLabel,
    promptRequirements: input.question ? [input.question] : [`Answer the supplied ${task.promptLabel} prompt.`],
    userThesis: 'The thesis needs to be identified more clearly.',
    paragraphMap: input.answer.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => ({
      paragraph: index + 1,
      purpose: index === 0 ? 'Opening or overview' : 'Development paragraph',
      strength: paragraph.slice(0, 100),
      concern: 'Needs specialist analysis after retry failure.',
    })),
    constraints: [`Recommended words: ${task.recommendedWords}`],
    wordCount: getWordCount(input.answer),
  };
}

function fallbackExaminer(input = {}) {
  const config = getExamConfig(input.mode);
  return {
    criteria: Object.fromEntries(config.criteria.map((key) => [key, {
      score: config.mode === 'IELTS' ? 0 : config.scoreScale.min,
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

function flattenCriteria(examiner, mode = 'IELTS') {
  const config = getExamConfig(mode);
  const output = {};
  config.criteria.forEach((key) => {
    output[key] = config.mode === 'IELTS'
      ? safeBand(examiner.criteria[key]?.score)
      : safeScore(examiner.criteria[key]?.score, config.scoreScale, config.scoreScale.min);
    output[`${key}_reason`] = examiner.criteria[key]?.reason || '';
  });
  return output;
}

function fallbackGeneratedQuestion(input = {}) {
  const config = getExamConfig(input.mode);
  const task = getTaskConfig(input.mode, input.part);
  if (config.mode === 'PTE' && task.id === '1') {
    return {
      question: 'Read the passage below and summarize it in one sentence.',
      instructions: 'Write one sentence between 5 and 75 words. Capture the main idea and key supporting point.',
      sourceText: 'Many universities are redesigning their libraries to support both digital research and collaborative learning. Although online databases have reduced the need for large print collections, students still value quiet study areas, expert research support, and shared spaces for group projects. As a result, modern libraries increasingly combine technology access with flexible learning environments.',
      recommendedWords: task.recommendedWords,
      timeMinutes: task.timeMinutes,
    };
  }
  return {
    question: config.mode === 'PTE'
      ? 'Some people believe that technology makes students more independent learners. To what extent do you agree or disagree?'
      : task.id === '1'
        ? 'The chart below shows changes in how people in one city travelled to work over a ten-year period. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.'
        : 'Some people think that governments should invest more money in public transport than in roads. To what extent do you agree or disagree?',
    instructions: `Write a response for ${task.promptLabel}.`,
    sourceText: '',
    recommendedWords: task.recommendedWords,
    timeMinutes: task.timeMinutes,
  };
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
    runAgent(prompts.examiner(withAnalysis), config.model, (value) => normalizeExaminer(value, input.mode), () => fallbackExaminer(input), images),
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

  const flatCriteria = flattenCriteria(examinerResult.data, input.mode);
  const score = calculateModeScore(flatCriteria, input.mode);
  const examConfig = getExamConfig(input.mode);
  const taskConfig = getTaskConfig(input.mode, input.part);

  return {
    mode: input.mode,
    targetScore: input.targetScore,
    scoreScale: examConfig.scoreScale,
    taskLabel: taskConfig.label,
    score,
    ...flatCriteria,
    correction: buildLegacyCorrection(correctionResult.data),
    correctionNotes: correctionResult.data.correctionNotes || [],
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

async function generateQuestion(payload, options = {}) {
  const config = getConfig(options);
  const client = options.client || createAzureClient(options);
  const input = baseInput({ ...payload, answer: '' });
  const prompt = prompts.questionGenerator(input);
  // Motivation vs Logic: generated questions need the same mode/task discipline as evaluation,
  // so the SLM returns a validated prompt contract and the app falls back to authentic samples
  // instead of placing malformed or mismatched practice text into the student's question box.
  const result = await runJsonAgent({
    client,
    model: config.slm,
    name: prompt.name,
    system: prompt.system,
    user: prompt.user,
    validate: normalizeGeneratedQuestion,
    fallback: () => fallbackGeneratedQuestion(input),
    timeoutMs: config.timeoutMs,
    callModel: options.callModel,
  });
  return {
    ...result.data,
    mode: input.mode,
    part: input.part,
    taskLabel: getTaskConfig(input.mode, input.part).label,
    agentTraceSummary: [result.trace],
  };
}

module.exports = {
  assistChat,
  evaluateWriting,
  fallbackAnalysis,
  fallbackGeneratedQuestion,
  generateQuestion,
};
