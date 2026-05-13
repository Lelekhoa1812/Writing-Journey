const { IELTS_CRITERIA, getExamConfig } = require('./examConfig');

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

module.exports = {
  CRITERIA,
  calculateModeScore,
  calculateOverallScore,
  getWordCount,
  roundToHalf,
  roundForScale,
  safeBand,
  safeScore,
};
