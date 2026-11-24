const { getExamConfig, getTaskConfig, normalizeMode } = require('./examConfig');

function nearestBands(target) {
  const band = Math.max(4, Math.min(8.5, Number(target) || 7));
  return [band - 0.5, band, band + 0.5];
}

function nearestPte(target) {
  const points = [40, 50, 65, 79, 90];
  const goal = Number(target) || 65;
  return [...points]
    .sort((left, right) => Math.abs(left - goal) - Math.abs(right - goal) || left - right)
    .slice(0, 3)
    .sort((left, right) => left - right);
}

function rungLine(score, text) {
  return `${score}: ${text}`;
}

function rubricCard(input = {}) {
  const mode = normalizeMode(input.mode);
  const config = getExamConfig(mode);
  const task = getTaskConfig(mode, input.part);
  const target = input.targetScore || input.band || config.defaultTarget;
  if (mode === 'PTE' && task.oneSentence) {
    return [
      'Score PTE Summarize Written Text in raw trait points. Do not invent a 10 to 90 score.',
      `The student's score-report goal is ${target}. That goal is not this item's total.`,
      'Content 0 to 4. Form 0 or 1. Grammar 0 to 2. Vocabulary 0 to 2. The item total is 9.',
      'Form is 0 when the response is not one sentence, is outside 5 to 75 words, or is written in capitals.',
      'If Content or Form is 0, the item total is 0.',
      'A strong sentence gives the main idea and one necessary support from the passage.',
    ].join('\n');
  }
  if (mode === 'PTE') {
    return [
      'Score PTE Write Essay in raw trait points. Do not invent a 10 to 90 score.',
      `The student's score-report goal is ${target}. That goal is not this item's total.`,
      'Content 0 to 6. Form 0 to 2. Development 0 to 6. Grammar 0 to 2. Linguistic range 0 to 6. Vocabulary 0 to 2. Spelling 0 to 2. The item total is 26.',
      'Full Form credit is 200 to 300 words. 120 to 199 or 301 to 380 caps Form at 1. Under 120 or over 380 scores 0 on every trait.',
      'All capitals or no punctuation also scores 0. If Content or Form is 0, the item total is 0.',
    ].join('\n');
  }
  const [low, mid, high] = nearestBands(target);
  if (String(task.id) === '1') {
    return [
      'Practice rubric for IELTS Academic Writing Task 1. This is not an official band.',
      'TR here means the overview, the selected features, and the comparisons. Do not expect an opinion.',
      'CC means the order of the data. LR means precise nouns and figures. GR means controlled sentences.',
      `Anchors for target ${target}:`,
      rungLine(low, 'The overview is missing, or the report lists figures without a comparison.'),
      rungLine(mid, 'The overview is clear and the main comparisons are supported by figures.'),
      rungLine(high, 'The overview leads, comparisons are grouped, and figures are accurate.'),
    ].join('\n');
  }
  return [
    'Practice rubric for IELTS Academic Writing Task 2. This is not an official band.',
    'TR here means the position, the coverage of the question, and the development of ideas.',
    'CC means paragraph progression. LR means precise wording. GR means range and control.',
    `Anchors for target ${target}:`,
    rungLine(low, 'The position is unclear, or a main part of the question is not developed.'),
    rungLine(mid, 'The position is clear and each idea has a relevant explanation or example.'),
    rungLine(high, 'The position stays precise, and each idea is extended with a specific result.'),
  ].join('\n');
}

module.exports = {
  nearestBands,
  nearestPte,
  rubricCard,
};
