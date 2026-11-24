const { IELTS_CRITERIA, getExamConfig, getTaskConfig, normalizeMode } = require('./examConfig');

const CRITERIA = IELTS_CRITERIA;

function safeBand(value, fallback = 0) {
  const number = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(9, number));
}

function roundToHalf(value) {
  return Math.round(safeBand(value) * 2) / 2;
}

function calculateOverallScore(criteria = {}) {
  const scores = CRITERIA.map((key) => safeBand(criteria[key]));
  return roundToHalf(scores.reduce((sum, score) => sum + score, 0) / CRITERIA.length);
}

function safeScore(value, scale, fallback = 0) {
  const number = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(scale.min, Math.min(scale.max, number));
}

function roundForScale(value, scale) {
  const safe = safeScore(value, scale);
  return scale.precision === 0 ? Math.round(safe) : roundToHalf(safe);
}

function calculateModeScore(criteria = {}, mode = 'IELTS') {
  const config = getExamConfig(mode);
  const scores = config.criteria.map((key) => safeScore(criteria[key], config.scoreScale));
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return roundForScale(average, config.scoreScale);
}

function getWordCount(text = '') {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function countSentences(text = '') {
  return String(text).split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length;
}

function measureDraft(mode, part, answer) {
  const task = getTaskConfig(mode, part);
  const text = String(answer || '');
  const wordCount = getWordCount(text);
  const sentenceCount = countSentences(text);
  const letters = text.replace(/[^A-Za-z]/g, '');
  const allCaps = letters.length > 0 && letters === letters.toUpperCase();
  const hasPunctuation = /[.!?]/.test(text);
  const belowMinimum = wordCount < (task.minWords || 0);
  const aboveMaximum = Boolean(task.maxWords) && wordCount > task.maxWords;
  let hardZero = false;
  let formCap = null;
  let formReason = '';
  if (normalizeMode(mode) === 'PTE' && task.oneSentence) {
    if (allCaps || sentenceCount !== 1 || wordCount < 5 || wordCount > 75) {
      formCap = 0;
      formReason = `Form is 0. The summary has ${sentenceCount} sentence(s) and ${wordCount} words. It needs one sentence of 5 to 75 words, and it cannot be written in capitals.`;
    }
  } else if (normalizeMode(mode) === 'PTE') {
    if (wordCount < (task.zeroBelowWords || 120) || wordCount > (task.zeroAboveWords || 380) || allCaps || !hasPunctuation) {
      hardZero = true;
      formReason = `This essay receives no trait points. It has ${wordCount} words. Under 120, over 380, all capitals, or no punctuation scores 0.`;
    } else if (belowMinimum || aboveMaximum) {
      formCap = 1;
      formReason = `Form is capped at 1. The essay has ${wordCount} words. Full Form credit needs 200 to 300 words.`;
    }
  }
  return {
    wordCount,
    sentenceCount,
    belowMinimum,
    aboveMaximum,
    allCaps,
    hardZero,
    formCap,
    formFailed: hardZero || formCap === 0,
    formReason,
  };
}

function calculateItemScore(flatCriteria = {}, traits = []) {
  if (Number(flatCriteria.Content) === 0 || Number(flatCriteria.Form) === 0) return 0;
  return traits.reduce((sum, trait) => sum + (Number(flatCriteria[trait.key]) || 0), 0);
}

module.exports = {
  CRITERIA,
  calculateItemScore,
  calculateModeScore,
  calculateOverallScore,
  countSentences,
  getWordCount,
  measureDraft,
  roundToHalf,
  roundForScale,
  safeBand,
  safeScore,
};
