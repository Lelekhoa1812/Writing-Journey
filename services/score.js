const CRITERIA = ['TR', 'CC', 'LR', 'GR'];

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

function getWordCount(text = '') {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

module.exports = {
  CRITERIA,
  calculateOverallScore,
  getWordCount,
  roundToHalf,
  safeBand,
};
