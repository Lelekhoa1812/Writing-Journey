const { coerceArray, coerceString } = require('./jsonUtils');
const { getExamConfig, getTraits } = require('./examConfig');
const { CRITERIA, roundToHalf } = require('./score');

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

function normalizeAnalysis(value) {
  const data = requireObject(value, 'analysis');
  return {
    taskType: coerceString(data.taskType, 'Unknown writing task'),
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
    visualFacts: coerceArray(data.visualFacts).map(String).filter(Boolean).slice(0, 6),
  };
}

function clampTrait(raw, max) {
  const number = Math.round(Number(raw));
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(max, number));
}

function normalizeExaminer(value, mode = 'IELTS', facts = {}) {
  const data = requireObject(value, 'examiner');
  const config = getExamConfig(mode);
  const traits = facts.traits || getTraits(mode, facts.part || '2');
  const criteria = {};
  traits.forEach((trait) => {
    const item = data.criteria?.[trait.key] || data[trait.key] || {};
    const raw = item.score ?? data[trait.key];
    criteria[trait.key] = {
      score: config.mode === 'IELTS' ? roundToHalf(raw) : clampTrait(raw, trait.max),
      max: trait.max,
      label: trait.label,
      reason: coerceString(item.reason ?? data[`${trait.key}_reason`], 'No reason supplied.'),
      evidence: coerceArray(item.evidence).map(String).slice(0, 4),
      nextStep: coerceString(item.nextStep, 'Focus on making this criterion more precise.'),
    };
  });
  if (config.mode === 'PTE' && facts.hardZero) {
    traits.forEach((trait) => {
      criteria[trait.key].score = 0;
      if (trait.key === 'Form') criteria[trait.key].reason = facts.formReason || criteria[trait.key].reason;
    });
  } else if (config.mode === 'PTE' && facts.formCap != null && criteria.Form) {
    criteria.Form.score = Math.min(criteria.Form.score, facts.formCap);
    if (facts.formReason) criteria.Form.reason = facts.formReason;
  }
  if (config.mode === 'PTE' && (criteria.Content?.score === 0 || criteria.Form?.score === 0)) {
    traits.forEach((trait) => {
      if (trait.key !== 'Content' && trait.key !== 'Form') criteria[trait.key].score = 0;
    });
  }
  return { criteria };
}

function normalizeDiagnosis(value) {
  const data = requireObject(value, 'diagnosis');
  return {
    diagnostics: coerceArray(data.diagnostics).map((item) => ({
      issue: coerceString(item.issue, 'Issue'),
      rootCause: coerceString(item.rootCause, 'Root cause not specified'),
      whyItMatters: coerceString(item.whyItMatters, 'This affects score clarity.'),
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
    correctionNotes: coerceArray(data.correctionNotes).map(String),
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
      reason: coerceString(item.reason, 'More precise for academic writing.'),
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

function normalizeGeneratedQuestion(value) {
  const data = requireObject(value, 'generated question');
  return {
    question: coerceString(data.question, ''),
    instructions: coerceString(data.instructions, ''),
    sourceText: coerceString(data.sourceText, ''),
    recommendedWords: coerceString(data.recommendedWords, ''),
    timeMinutes: Number(data.timeMinutes) || 0,
  };
}

module.exports = {
  CRITERIA,
  normalizeAnalysis,
  normalizeCorrection,
  normalizeDiagnosis,
  normalizeExaminer,
  normalizeGeneratedQuestion,
  normalizeLearningPlan,
  normalizeModelAnswer,
  normalizeSynthesis,
};
