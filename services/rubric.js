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
    const [low, mid, high] = nearestPte(target);
    return [
      'Practice rubric for PTE Summarize Written Text. This is not a Pearson score.',
      'Form: one sentence, 5 to 75 words. A second sentence or a word count outside that range fails Form.',
      'Content: the sentence states the main idea and one necessary supporting point from the passage.',
      'Grammar, vocabulary, and coherence describe control inside that one sentence.',
      `Anchors for target ${target}:`,
      rungLine(low, 'The sentence misses the main idea or adds a claim that is not in the passage.'),
      rungLine(mid, 'The sentence gives the main idea and one relevant support, with clear grammar.'),
      rungLine(high, 'The sentence is precise, concise, and uses the passage relationship accurately.'),
    ].join('\n');
  }
  if (mode === 'PTE') {
    const [low, mid, high] = nearestPte(target);
    return [
      'Practice rubric for PTE Write Essay. This is not a Pearson score.',
      'Form: 200 to 300 words. Content: a direct position with relevant support.',
      'Grammar, vocabulary, and coherence describe control, range, and paragraph order.',
      `Anchors for target ${target}:`,
      rungLine(low, 'The position is unclear or the support does not answer the prompt.'),
      rungLine(mid, 'The position is clear and each body paragraph gives one relevant reason.'),
      rungLine(high, 'The position, reasons, and examples stay specific and controlled throughout.'),
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
