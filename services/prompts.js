const { MODE_PTE, getExamConfig, getTaskConfig } = require('./examConfig');

function commonContext(input) {
  const config = getExamConfig(input.mode);
  const task = getTaskConfig(input.mode, input.part);
  const target = input.targetScore || input.band || config.defaultTarget;
  return [
    `Exam mode: ${config.label}`,
    `${config.targetLabel}: ${target}`,
    `Writing task: ${task.promptLabel}`,
    `Task guidance: ${task.recommendedWords}${task.oneSentence ? '; the response must be one sentence.' : ''}`,
    `Question: ${input.question || `No typed question supplied. If an image is attached, inspect it for the ${config.label} task prompt or visual data.`}`,
    input.analysis ? `Known analysis: ${JSON.stringify(input.analysis)}` : '',
    `User answer:\n${input.answer}`,
  ].filter(Boolean).join('\n\n');
}

const jsonRule = 'Return only one valid JSON object. Do not include markdown fences, commentary, or keys outside the requested shape.';

function modeCopy(input) {
  const config = getExamConfig(input.mode);
  if (config.mode === MODE_PTE) {
    return {
      analyst: 'You are a PTE Academic Writing task analyst. Extract the task type, passage/prompt constraints, response form, and scoring-relevant requirements.',
      examiner: 'You are a strict but helpful PTE Academic Writing evaluator. Score evidence against PTE task expectations, including content, form, grammar, vocabulary, coherence, and task-specific word/sentence constraints.',
      diagnosis: 'You are a PTE Writing diagnostician. Explain root causes behind errors, weak content selection, form violations, and unclear language.',
      correction: 'You are a PTE correction coach. Preserve the student intent while making teachable corrections for concise, accurate PTE writing.',
      modelAnswer: 'You write natural PTE model responses aligned to the target score and selected task. For Summarize Written Text, produce one sentence of 5-75 words.',
      learningPlan: 'You are a PTE Writing coach who creates short, high-leverage practice plans tied to PTE item expectations.',
      synthesis: 'You are the lead PTE teacher synthesizing specialist reports into a clear coaching summary.',
      chat: 'You are a concise, practical PTE/IELTS Writing tutor. Use the latest evaluation context when supplied. Avoid generic advice.',
    };
  }
  return {
    analyst: 'You are an IELTS task analyst. Extract the writing task, constraints, and structure.',
    examiner: 'You are a strict but helpful IELTS Writing examiner. Score evidence, not vibes.',
    diagnosis: 'You are a thought-provoking IELTS writing diagnostician. Explain root causes behind errors and weak thinking.',
    correction: "You are an IELTS correction coach. Preserve the student's intent while making teachable corrections.",
    modelAnswer: 'You write natural IELTS model answers aligned to the target band, not unrealistically perfect essays.',
    learningPlan: 'You are an IELTS writing coach who creates short, high-leverage practice plans.',
    synthesis: 'You are the lead IELTS teacher synthesizing specialist agent reports into a clear coaching summary.',
    chat: 'You are a concise, practical IELTS Writing tutor. Use the latest evaluation context when supplied. Avoid generic advice.',
  };
}

function inputAnalyzer(input) {
  const copy = modeCopy(input);
  return {
    name: 'Input Analyzer Agent',
    system: `${copy.analyst} ${jsonRule}`,
    user: `${commonContext(input)}\n\nReturn JSON: {"taskType":"","promptRequirements":[""],"userThesis":"","paragraphMap":[{"paragraph":1,"purpose":"","strength":"","concern":""}],"constraints":[""],"wordCount":0}`,
  };
}

function examiner(input) {
  const copy = modeCopy(input);
  const config = getExamConfig(input.mode);
  const criteriaShape = Object.fromEntries(config.criteria.map((key) => [key, {
    score: 0,
    reason: '',
    evidence: [''],
    nextStep: '',
  }]));
  return {
    name: `${config.label} Examiner Agent`,
    system: `${copy.examiner} Return criterion scores on the ${config.scoreScale.min}-${config.scoreScale.max} scale. ${jsonRule}`,
    user: `${commonContext(input)}\n\nReturn JSON: ${JSON.stringify({ criteria: criteriaShape })}`,
  };
}

function diagnosis(input) {
  const copy = modeCopy(input);
  return {
    name: 'Error Diagnosis Agent',
    system: `${copy.diagnosis} ${jsonRule}`,
    user: `${commonContext(input)}\n\nReturn JSON: {"diagnostics":[{"criterion":"","issue":"","rootCause":"","whyItMatters":"","fixStrategy":""}],"ideaInsights":[{"originalIdea":"","problem":"","deeperAlternative":""}],"cohesionMap":[{"step":1,"role":"","linkQuality":"","improvement":""}]}`,
  };
}

function correction(input) {
  const copy = modeCopy(input);
  return {
    name: 'Correction Coach Agent',
    system: `${copy.correction} ${jsonRule}`,
    user: `${commonContext(input)}\n\nReturn JSON: {"correction":"Reproduce the full student draft exactly. For every error, wrap the bad phrase inline as <->bad phrase</-> immediately followed by <+>fixed phrase</+>. Leave all correct text unchanged. Do not use any other markdown.","correctionNotes":["Fix 'X' to 'Y' because ...", "To aim for the target score, you should ..."],"sentenceInsights":[{"sentenceNumber":1,"original":"","revised":"","issueType":"","whyWrong":"","principle":""}],"vocabularyUpgrades":[{"original":"","upgrade":"","reason":""}],"grammarPatterns":[{"pattern":"","problem":"","exampleFix":""}]}`,
  };
}

function modelAnswer(input) {
  const copy = modeCopy(input);
  return {
    name: 'Model Answer Agent',
    system: `${copy.modelAnswer} ${jsonRule}`,
    user: `${commonContext(input)}\n\nReturn JSON: {"modelAnswer":"","modelAnswerNotes":[""]}`,
  };
}

function learningPlan(input) {
  const copy = modeCopy(input);
  return {
    name: 'Learning Plan Agent',
    system: `${copy.learningPlan} ${jsonRule}`,
    user: `${commonContext(input)}\n\nExaminer and diagnosis context: ${JSON.stringify(input.examiner || {})} ${JSON.stringify(input.diagnosis || {})}\n\nReturn JSON: {"practicePlan":[{"priority":1,"focus":"","drill":"","successSignal":""}]}`,
  };
}

function synthesis(input) {
  const copy = modeCopy(input);
  return {
    name: 'Synthesis Agent',
    system: `${copy.synthesis} ${jsonRule}`,
    user: `${commonContext(input)}\n\nSpecialist reports:\n${JSON.stringify({
      examiner: input.examiner,
      diagnosis: input.diagnosis,
      correction: input.correction,
      learningPlan: input.learningPlan,
    })}\n\nReturn JSON: {"overview":"","targetBandGap":[""],"topPriorities":[""],"encouragement":""}`,
  };
}

function chatAssistant({ message, evaluationContext }) {
  const copy = modeCopy(evaluationContext || {});
  return {
    name: 'Chat Assistant Agent',
    system: copy.chat,
    user: `Latest evaluation context:\n${JSON.stringify(evaluationContext || {})}\n\nStudent message:\n${message}`,
  };
}

function questionGenerator(input) {
  const config = getExamConfig(input.mode);
  const task = getTaskConfig(input.mode, input.part);
  const pteSwt = config.mode === MODE_PTE && task.id === '1';
  const taskSpecific = pteSwt
    ? 'Generate an academic source passage of 180-260 words as sourceText. Set question to a one-sentence instruction asking the student to summarize it in 5-75 words. Leave instructions empty.'
    : `Generate a realistic ${task.promptLabel} writing prompt. The question field must contain the full scenario and task directive (e.g. "Some people believe X while others argue Y. Discuss both views and give your own opinion."). Do NOT put generic essay-writing directions (word-count advice, timing, or meta-instructions) in the instructions field — leave instructions empty.`;
  return {
    name: `${config.label} Question Generator Agent`,
    system: `You create authentic ${config.label} writing practice questions that follow the official exam format exactly. ${taskSpecific} ${jsonRule}`,
    user: `Mode: ${config.label}\nTask: ${task.promptLabel}\nRecommended words: ${task.recommendedWords}\nTime minutes: ${task.timeMinutes}\n\nReturn JSON: {"question":"","instructions":"","sourceText":"","recommendedWords":"${task.recommendedWords}","timeMinutes":${task.timeMinutes}}`,
  };
}

module.exports = {
  chatAssistant,
  correction,
  diagnosis,
  examiner,
  inputAnalyzer,
  learningPlan,
  modelAnswer,
  questionGenerator,
  synthesis,
};
