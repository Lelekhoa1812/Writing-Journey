const { coerceArray, coerceString } = require('./jsonUtils');
const { CRITERIA, safeBand } = require('./score');

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

function normalizeAnalysis(value) {
  const data = requireObject(value, 'analysis');
  return {
    taskType: coerceString(data.taskType, 'Unknown IELTS writing task'),
    promptRequirements: coerceArray(data.promptRequirements).map(String),
    userThesis: coerceString(data.userThesis, 'Not clearly stated'),
    paragraphMap: coerceArray(data.paragraphMap).map((item, index) => ({
      paragraph: Number(item.paragraph) || index + 1,
      purpose: coerceString(item.purpose, 'Purpose unclear'),
      strength: coerceString(item.strength, 'Needs clearer development'),
      concern: coerceString(item.concern, 'No specific concern supplied'),
    })),
    constraints: coerceArray(data.constraints).map(String),
    wordCount: Number(data.wordCount) || 0,
  };
}

function normalizeExaminer(value) {
  const data = requireObject(value, 'examiner');
  const criteria = {};
  CRITERIA.forEach((key) => {
    const item = data.criteria?.[key] || data[key] || {};
    criteria[key] = {
      score: safeBand(item.score ?? data[key]),
      reason: coerceString(item.reason ?? data[`${key}_reason`], 'No reason supplied.'),
      evidence: coerceArray(item.evidence).map(String).slice(0, 4),
      nextStep: coerceString(item.nextStep, 'Focus on making this criterion more precise.'),
    };
  });
  return { criteria };
}

function normalizeDiagnosis(value) {
  const data = requireObject(value, 'diagnosis');
  return {
    diagnostics: coerceArray(data.diagnostics).map((item) => ({
      issue: coerceString(item.issue, 'Issue'),
      rootCause: coerceString(item.rootCause, 'Root cause not specified'),
      whyItMatters: coerceString(item.whyItMatters, 'This affects IELTS band clarity.'),
      fixStrategy: coerceString(item.fixStrategy, 'Revise with a clearer choice.'),
      criterion: coerceString(item.criterion, 'General'),
    })),
    ideaInsights: coerceArray(data.ideaInsights).map((item) => ({
      originalIdea: coerceString(item.originalIdea, 'Idea not quoted'),
      problem: coerceString(item.problem, 'Problem not specified'),
      deeperAlternative: coerceString(item.deeperAlternative, 'Develop this idea with a clearer cause or consequence.'),
    })),
    cohesionMap: coerceArray(data.cohesionMap).map((item, index) => ({
      step: Number(item.step) || index + 1,
      role: coerceString(item.role, 'Paragraph role unclear'),
      linkQuality: coerceString(item.linkQuality, 'Link quality unclear'),
      improvement: coerceString(item.improvement, 'Clarify the relationship between ideas.'),
    })),
  };
}

function normalizeCorrection(value) {
  const data = requireObject(value, 'correction');
  return {
    correction: coerceString(data.correction, ''),
    sentenceInsights: coerceArray(data.sentenceInsights).map((item, index) => ({
      sentenceNumber: Number(item.sentenceNumber) || index + 1,
      original: coerceString(item.original, ''),
      revised: coerceString(item.revised, ''),
      issueType: coerceString(item.issueType, 'General'),
      whyWrong: coerceString(item.whyWrong, 'The issue reduces clarity or accuracy.'),
      principle: coerceString(item.principle, 'Make the sentence clearer and more controlled.'),
    })),
    vocabularyUpgrades: coerceArray(data.vocabularyUpgrades).map((item) => ({
      original: coerceString(item.original, ''),
      upgrade: coerceString(item.upgrade, ''),
      reason: coerceString(item.reason, 'More precise for academic IELTS writing.'),
    })),
    grammarPatterns: coerceArray(data.grammarPatterns).map((item) => ({
      pattern: coerceString(item.pattern, 'Grammar pattern'),
      problem: coerceString(item.problem, 'Problem not specified'),
      exampleFix: coerceString(item.exampleFix, 'No example supplied'),
    })),
  };
}

function normalizeModelAnswer(value) {
  const data = requireObject(value, 'model answer');
  return {
    modelAnswer: coerceString(data.modelAnswer, ''),
    modelAnswerNotes: coerceArray(data.modelAnswerNotes).map(String),
  };
}

function normalizeLearningPlan(value) {
  const data = requireObject(value, 'learning plan');
  return {
    practicePlan: coerceArray(data.practicePlan).map((item, index) => ({
      priority: Number(item.priority) || index + 1,
      focus: coerceString(item.focus, 'Writing focus'),
      drill: coerceString(item.drill, 'Practice this skill in the next answer.'),
      successSignal: coerceString(item.successSignal, 'You can explain the improvement clearly.'),
    })),
  };
}

function normalizeSynthesis(value) {
  const data = requireObject(value, 'synthesis');
  return {
    overview: coerceString(data.overview, 'Your answer has been reviewed.'),
    targetBandGap: coerceArray(data.targetBandGap).map(String),
    topPriorities: coerceArray(data.topPriorities).map(String),
    encouragement: coerceString(data.encouragement, 'Keep practicing with focused revisions.'),
  };
}

module.exports = {
  normalizeAnalysis,
  normalizeCorrection,
  normalizeDiagnosis,
  normalizeExaminer,
  normalizeLearningPlan,
  normalizeModelAnswer,
  normalizeSynthesis,
};
