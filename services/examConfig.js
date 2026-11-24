const MODE_IELTS = 'IELTS';
const MODE_PTE = 'PTE';

const IELTS_CRITERIA = ['TR', 'CC', 'LR', 'GR'];
const PTE_SUMMARY_TRAITS = [
  { key: 'Content', max: 4, label: 'Content' },
  { key: 'Form', max: 1, label: 'Form' },
  { key: 'Grammar', max: 2, label: 'Grammar' },
  { key: 'Vocabulary', max: 2, label: 'Vocabulary' },
];
const PTE_ESSAY_TRAITS = [
  { key: 'Content', max: 6, label: 'Content' },
  { key: 'Form', max: 2, label: 'Form' },
  { key: 'Development', max: 6, label: 'Development, structure and coherence' },
  { key: 'Grammar', max: 2, label: 'Grammar' },
  { key: 'LinguisticRange', max: 6, label: 'General linguistic range' },
  { key: 'Vocabulary', max: 2, label: 'Vocabulary range' },
  { key: 'Spelling', max: 2, label: 'Spelling' },
];
const PTE_CRITERIA = PTE_ESSAY_TRAITS.map((trait) => trait.key);

function ieltsTraits(taskResponseLabel) {
  return [
    { key: 'TR', max: 9, label: taskResponseLabel },
    { key: 'CC', max: 9, label: 'Coherence and cohesion' },
    { key: 'LR', max: 9, label: 'Lexical resource' },
    { key: 'GR', max: 9, label: 'Grammatical range and accuracy' },
  ];
}

// Motivation vs Logic: IELTS and PTE share the same orchestration pipeline but differ in
// task names, scoring scales, and response constraints; centralizing exam metadata keeps
// prompts, validation, scoring, and UI payload handling aligned as modes expand.
const EXAM_CONFIGS = {
  [MODE_IELTS]: {
    mode: MODE_IELTS,
    label: 'IELTS',
    targetLabel: 'Target band',
    scoreScale: { min: 0, max: 9, precision: 1 },
    defaultTarget: '7.0',
    criteria: IELTS_CRITERIA,
    tasks: {
      1: {
        id: '1',
        label: 'Part 1',
        promptLabel: 'IELTS Writing Part 1',
        minWords: 150,
        recommendedWords: 'at least 150 words',
        timeMinutes: 20,
        traits: ieltsTraits('Task achievement'),
      },
      2: {
        id: '2',
        label: 'Part 2',
        promptLabel: 'IELTS Writing Part 2',
        minWords: 250,
        recommendedWords: 'at least 250 words',
        timeMinutes: 40,
        traits: ieltsTraits('Task response'),
      },
    },
  },
  [MODE_PTE]: {
    mode: MODE_PTE,
    label: 'PTE',
    targetLabel: 'Score-report goal',
    scoreScale: { min: 0, max: 26, precision: 0 },
    defaultTarget: '65',
    criteria: PTE_CRITERIA,
    tasks: {
      1: {
        id: '1',
        label: 'Summarize Written Text',
        promptLabel: 'PTE Summarize Written Text',
        minWords: 5,
        maxWords: 75,
        oneSentence: true,
        recommendedWords: '5-75 words in one sentence',
        timeMinutes: 10,
        traits: PTE_SUMMARY_TRAITS,
        itemMax: 9,
      },
      2: {
        id: '2',
        label: 'Write Essay',
        promptLabel: 'PTE Write Essay',
        minWords: 200,
        maxWords: 300,
        recommendedWords: '200-300 words for full Form credit',
        timeMinutes: 20,
        traits: PTE_ESSAY_TRAITS,
        itemMax: 26,
        zeroBelowWords: 120,
        zeroAboveWords: 380,
      },
    },
  },
};

function normalizeMode(mode) {
  const normalized = String(mode || '').trim().toUpperCase();
  return normalized === MODE_PTE ? MODE_PTE : MODE_IELTS;
}

function getExamConfig(mode) {
  return EXAM_CONFIGS[normalizeMode(mode)];
}

function getTaskConfig(mode, part) {
  const config = getExamConfig(mode);
  return config.tasks[String(part || '2')] || config.tasks['2'];
}

function getTraits(mode, part) {
  return getTaskConfig(mode, part).traits;
}

function traitMax(traits) {
  return traits.reduce((sum, trait) => sum + trait.max, 0);
}

module.exports = {
  EXAM_CONFIGS,
  IELTS_CRITERIA,
  MODE_IELTS,
  MODE_PTE,
  PTE_CRITERIA,
  getExamConfig,
  getTaskConfig,
  getTraits,
  normalizeMode,
  traitMax,
};
