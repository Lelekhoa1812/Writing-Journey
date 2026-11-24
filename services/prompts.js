const { MODE_PTE, getExamConfig, getTaskConfig, getTraits } = require('./examConfig');
const { rubricCard } = require('./rubric');

function commonContext(input) {
  const config = getExamConfig(input.mode);
  const task = getTaskConfig(input.mode, input.part);
  const target = input.targetScore || input.band || config.defaultTarget;
  return [
    `Exam mode: ${config.label}`,
    `${config.targetLabel}: ${target}`,
    `Writing task: ${task.promptLabel}`,
    `Task guidance: ${task.recommendedWords}${task.oneSentence ? '; the response must be one sentence.' : ''}`,
    `Question: ${input.question || 'No typed question supplied.'}`,
    `Measured words: ${input.wordCount ?? 'unknown'}`,
    `Measured sentences: ${input.sentenceCount ?? 'unknown'}`,
    input.belowMinimum ? 'The draft is under the task minimum.' : '',
    input.aboveMaximum ? 'The draft is over the task maximum.' : '',
    input.visualFacts?.length ? `Chart facts: ${input.visualFacts.join('; ')}` : '',
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
      examiner: 'You are a strict but helpful PTE Academic Writing evaluator. Score each published trait as an integer on its own raw scale. Do not convert traits into a 10 to 90 score.',
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
    user: `${commonContext(input)}\n\nIf a chart image is attached, put up to six short facts in visualFacts. Otherwise return an empty array. Return JSON: {"taskType":"","promptRequirements":[""],"userThesis":"","paragraphMap":[{"paragraph":1,"purpose":"","strength":"","concern":""}],"constraints":[""],"wordCount":0,"visualFacts":[""]}`,
  };
}

function examiner(input) {
  const copy = modeCopy(input);
  const config = getExamConfig(input.mode);
  const traits = getTraits(input.mode, input.part);
  const criteriaShape = Object.fromEntries(traits.map((trait) => [trait.key, {
    score: 0,
    reason: '',
    evidence: [''],
    nextStep: '',
  }]));
  const scaleLine = traits.map((trait) => `${trait.key} is an integer from 0 to ${trait.max}.`).join(' ');
  return {
    name: `${config.label} Examiner Agent`,
    system: `${copy.examiner} Quote the student before you score. The measured word count is final. ${rubricCard(input)} ${scaleLine} ${jsonRule}`,
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
    system: `${copy.synthesis} The examiner scores are final. Do not calculate a new score. ${jsonRule}`,
    user: `${commonContext(input)}\n\nSpecialist reports:\n${JSON.stringify({
      examiner: input.examiner,
      diagnosis: input.diagnosis,
      correction: input.correction,
    })}\n\nReturn JSON: {"overview":"","targetBandGap":[""],"topPriorities":[""],"encouragement":""}`,
  };
}

function examRulesCard() {
  return [
    'Published form limits. Quote these limits. Do not invent a different word count.',
    'IELTS Part 1: at least 150 words, about 20 minutes.',
    'IELTS Part 2: at least 250 words, about 40 minutes. The practice band runs from 0 to 9 in half bands.',
    'PTE Summarize Written Text: one sentence of 5 to 75 words, about 10 minutes. Form is 0 outside that range or when the response is not one sentence.',
    'PTE Write Essay: 200 to 300 words for full Form credit, about 20 minutes. Under 120 words, over 380 words, all capitals, or no punctuation scores 0.',
    'A PTE item score is the sum of its trait points. Do not turn one item into a 10 to 90 score.',
  ].join(' ');
}

function chatAssistant({ message, evaluationContext, history = [], mode, part }) {
  const active = {
    ...(evaluationContext || {}),
    mode: evaluationContext?.mode || mode,
    part: evaluationContext?.part || part,
  };
  const copy = modeCopy(active);
  const prior = history.length
    ? `Earlier turns:\n${history.map((item) => `${item.role}: ${item.content}`).join('\n')}\n\n`
    : '';
  return {
    name: 'Chat Assistant Agent',
    system: `${copy.chat} Active mode: ${active.mode || 'IELTS'}. Active part: ${active.part || '2'}. ${examRulesCard()} The examiner scores are final. You may explain them. You may not invent a new score. You may call get_exam_rules, count_words, or get_score_snapshot when the student asks about limits, length, or scores. After a tool result, answer in short plain sentences.`,
    user: `${prior}Latest evaluation snapshot:\n${JSON.stringify(evaluationContext || {})}\n\nStudent message:\n${message}`,
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
