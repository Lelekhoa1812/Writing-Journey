function commonContext({ band, part, question, answer, analysis }) {
  return [
    `Target band: ${band}`,
    `IELTS Writing Part: ${part}`,
    `Question: ${question || 'No typed question supplied. If an image is attached, inspect it for the task prompt or visual data.'}`,
    analysis ? `Known analysis: ${JSON.stringify(analysis)}` : '',
    `User answer:\n${answer}`,
  ].filter(Boolean).join('\n\n');
}

const jsonRule = 'Return only one valid JSON object. Do not include markdown fences, commentary, or keys outside the requested shape.';

function inputAnalyzer(input) {
  return {
    name: 'Input Analyzer Agent',
    system: `You are an IELTS task analyst. Extract the writing task, constraints, and structure. ${jsonRule}`,
    user: `${commonContext(input)}\n\nReturn JSON: {"taskType":"","promptRequirements":[""],"userThesis":"","paragraphMap":[{"paragraph":1,"purpose":"","strength":"","concern":""}],"constraints":[""],"wordCount":0}`,
  };
}

function examiner(input) {
  return {
    name: 'IELTS Examiner Agent',
    system: `You are a strict but helpful IELTS Writing examiner. Score evidence, not vibes. ${jsonRule}`,
    user: `${commonContext(input)}\n\nReturn JSON: {"criteria":{"TR":{"score":0,"reason":"","evidence":[""],"nextStep":""},"CC":{"score":0,"reason":"","evidence":[""],"nextStep":""},"LR":{"score":0,"reason":"","evidence":[""],"nextStep":""},"GR":{"score":0,"reason":"","evidence":[""],"nextStep":""}}}`,
  };
}

function diagnosis(input) {
  return {
    name: 'Error Diagnosis Agent',
    system: `You are a thought-provoking IELTS writing diagnostician. Explain root causes behind errors and weak thinking. ${jsonRule}`,
    user: `${commonContext(input)}\n\nReturn JSON: {"diagnostics":[{"criterion":"","issue":"","rootCause":"","whyItMatters":"","fixStrategy":""}],"ideaInsights":[{"originalIdea":"","problem":"","deeperAlternative":""}],"cohesionMap":[{"step":1,"role":"","linkQuality":"","improvement":""}]}`,
  };
}

function correction(input) {
  return {
    name: 'Correction Coach Agent',
    system: `You are an IELTS correction coach. Preserve the student's intent while making teachable corrections. ${jsonRule}`,
    user: `${commonContext(input)}\n\nReturn JSON: {"correction":"Use ~~wrong~~ **correct** markdown in context.","sentenceInsights":[{"sentenceNumber":1,"original":"","revised":"","issueType":"","whyWrong":"","principle":""}],"vocabularyUpgrades":[{"original":"","upgrade":"","reason":""}],"grammarPatterns":[{"pattern":"","problem":"","exampleFix":""}]}`,
  };
}

function modelAnswer(input) {
  return {
    name: 'Model Answer Agent',
    system: `You write natural IELTS model answers aligned to the target band, not unrealistically perfect essays. ${jsonRule}`,
    user: `${commonContext(input)}\n\nReturn JSON: {"modelAnswer":"","modelAnswerNotes":[""]}`,
  };
}

function learningPlan(input) {
  return {
    name: 'Learning Plan Agent',
    system: `You are an IELTS writing coach who creates short, high-leverage practice plans. ${jsonRule}`,
    user: `${commonContext(input)}\n\nExaminer and diagnosis context: ${JSON.stringify(input.examiner || {})} ${JSON.stringify(input.diagnosis || {})}\n\nReturn JSON: {"practicePlan":[{"priority":1,"focus":"","drill":"","successSignal":""}]}`,
  };
}

function synthesis(input) {
  return {
    name: 'Synthesis Agent',
    system: `You are the lead IELTS teacher synthesizing specialist agent reports into a clear coaching summary. ${jsonRule}`,
    user: `${commonContext(input)}\n\nSpecialist reports:\n${JSON.stringify({
      examiner: input.examiner,
      diagnosis: input.diagnosis,
      correction: input.correction,
      learningPlan: input.learningPlan,
    })}\n\nReturn JSON: {"overview":"","targetBandGap":[""],"topPriorities":[""],"encouragement":""}`,
  };
}

function chatAssistant({ message, evaluationContext }) {
  return {
    name: 'Chat Assistant Agent',
    system: 'You are a concise, practical IELTS Writing tutor. Use the latest evaluation context when supplied. Avoid generic advice.',
    user: `Latest evaluation context:\n${JSON.stringify(evaluationContext || {})}\n\nStudent message:\n${message}`,
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
  synthesis,
};
