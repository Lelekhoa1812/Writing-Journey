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
const { getExamConfig, getTaskConfig, getTraits, normalizeMode, traitMax } = require('./examConfig');
const { calculateItemScore, calculateModeScore, getWordCount, measureDraft, safeBand } = require('./score');
const { runJsonAgent, runTextAgent } = require('./azureClient');
const { getNimPool, runToolLoop } = require('./nimClient');
const { CHAT_TOOLS, compactEvaluation, compactHistory, executeChatTool } = require('./session');

function getConfig(overrides = {}) {
  return {
    model: overrides.model || process.env.NIM_LLM_ROLE || 'llm',
    slm: overrides.slm || process.env.NIM_SLM_ROLE || 'slm',
    timeoutMs: Number(overrides.timeoutMs || process.env.NIM_TIMEOUT_MS || 90000),
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
  const traits = getTraits(input.mode, input.part);
  return {
    criteria: Object.fromEntries(traits.map((trait) => [trait.key, {
      score: 0,
      max: trait.max,
      label: trait.label,
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

function flattenCriteria(examiner, mode = 'IELTS', part = '2') {
  const traits = getTraits(mode, part);
  const output = {};
  traits.forEach((trait) => {
    const score = examiner.criteria[trait.key]?.score;
    output[trait.key] = normalizeMode(mode) === 'IELTS' ? safeBand(score) : Number(score) || 0;
    output[`${trait.key}_reason`] = examiner.criteria[trait.key]?.reason || '';
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
  return (agentPrompt, model, validate, fallback, images = [], limits = {}) => runJsonAgent({
    client,
    model,
    name: agentPrompt.name,
    system: agentPrompt.system,
    user: agentPrompt.user,
    validate,
    fallback,
    images,
    timeoutMs: config.timeoutMs,
    maxTokens: limits.maxTokens,
    temperature: limits.temperature,
    maxRetries: limits.maxRetries || 2,
    callModel,
  });
}

async function evaluateWriting(payload, options = {}) {
  const config = getConfig(options);
  const client = options.client || getNimPool();
  const callModel = options.callModel;
  const input = baseInput(payload);
  const runAgent = makeAgentRunner(client, config, callModel);
  const traces = [];

  // Motivation vs Logic: specialist agents make feedback deeper by separating examiner judgement,
  // diagnosis, correction, modelling, and practice planning; the orchestrator keeps their JSON
  // contracts explicit so the UI can teach from structured evidence instead of free-form blobs.
  const analysisPrompt = prompts.inputAnalyzer(input);
  const images = input.image ? [input.image] : [];
  const fastLimits = { maxTokens: 2048, temperature: 0.2 };
  const scoreLimits = { maxTokens: 4096, temperature: 0 };
  const proseLimits = { maxTokens: 8192, temperature: 0.2 };
  const analysisResult = await runAgent(
    analysisPrompt,
    config.slm,
    normalizeAnalysis,
    () => fallbackAnalysis(input),
    images,
    fastLimits,
  );
  traces.push(analysisResult.trace);
  const measured = measureDraft(input.mode, input.part, input.answer);
  const analysis = {
    ...analysisResult.data,
    wordCount: measured.wordCount,
    visualFacts: analysisResult.data.visualFacts || [],
  };
  const withAnalysis = {
    ...input,
    ...measured,
    analysis,
    visualFacts: analysis.visualFacts,
  };

  const [examinerResult, diagnosisResult, correctionResult, modelAnswerResult] = await Promise.all([
    runAgent(prompts.examiner(withAnalysis), config.model, (value) => normalizeExaminer(value, input.mode, { ...measured, part: input.part }), () => fallbackExaminer(input), [], scoreLimits),
    runAgent(prompts.diagnosis(withAnalysis), config.model, normalizeDiagnosis, fallbackDiagnosis, [], scoreLimits),
    runAgent(prompts.correction(withAnalysis), config.model, normalizeCorrection, fallbackCorrection, [], proseLimits),
    runAgent(prompts.modelAnswer(withAnalysis), config.model, normalizeModelAnswer, fallbackModelAnswer, [], proseLimits),
  ]);
  traces.push(examinerResult.trace, diagnosisResult.trace, correctionResult.trace, modelAnswerResult.trace);

  const learningInput = {
    ...withAnalysis,
    examiner: examinerResult.data,
    diagnosis: diagnosisResult.data,
  };
  const synthesisInput = {
    ...withAnalysis,
    examiner: examinerResult.data,
    diagnosis: diagnosisResult.data,
    correction: correctionResult.data,
  };
  const [learningResult, synthesisResult] = await Promise.all([
    runAgent(prompts.learningPlan(learningInput), config.slm, normalizeLearningPlan, fallbackLearningPlan, [], fastLimits),
    runAgent(prompts.synthesis(synthesisInput), config.slm, normalizeSynthesis, fallbackSynthesis, [], fastLimits),
  ]);
  traces.push(learningResult.trace, synthesisResult.trace);

  const traits = getTraits(input.mode, input.part);
  const flatCriteria = flattenCriteria(examinerResult.data, input.mode, input.part);
  const examConfig = getExamConfig(input.mode);
  const taskConfig = getTaskConfig(input.mode, input.part);
  const score = input.mode === 'PTE'
    ? calculateItemScore(flatCriteria, traits)
    : calculateModeScore(flatCriteria, input.mode);
  const scoreScale = input.mode === 'PTE'
    ? { min: 0, max: taskConfig.itemMax || traitMax(traits), precision: 0 }
    : examConfig.scoreScale;

  return {
    mode: input.mode,
    scoreNotice: input.mode === 'PTE'
      ? 'These are raw item points. Pearson does not turn one writing item into the 10 to 90 Writing score.'
      : 'Practice band. This is not an official IELTS result.',
    targetScore: input.targetScore,
    traits,
    scoreScale,
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
  const client = options.client || (options.callModel ? {} : getNimPool());
  const evaluationContext = compactEvaluation(payload.evaluationContext);
  const history = compactHistory(payload.history);
  const prompt = prompts.chatAssistant({
    message: payload.message || '',
    evaluationContext,
    history: options.callModel || typeof client.complete !== 'function' ? history : [],
  });
  if (options.callModel || typeof client.complete !== 'function') {
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

  try {
    const result = await runToolLoop({
      pool: client,
      role: config.slm,
      timeoutMs: config.timeoutMs,
      tools: CHAT_TOOLS,
      execute: (name, args) => executeChatTool(name, args, evaluationContext),
      messages: [
        { role: 'system', content: prompt.system },
        ...history.map((item) => ({ role: item.role, content: item.content })),
        { role: 'user', content: prompt.user },
      ],
    });
    return {
      reply: result.text,
      agentTraceSummary: [{
        name: prompt.name,
        model: result.model,
        keySlot: result.keySlot,
        cachedTokens: result.cachedTokens ?? null,
        attempts: 1,
        ok: true,
      }],
    };
  } catch (error) {
    return {
      reply: 'I could not get a reliable response after several attempts. Please try again with a shorter question.',
      agentTraceSummary: [{
        name: prompt.name,
        model: config.slm,
        attempts: 1,
        ok: false,
        error: error.message,
      }],
    };
  }
}

async function generateQuestion(payload, options = {}) {
  const config = getConfig(options);
  const client = options.client || getNimPool();
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
