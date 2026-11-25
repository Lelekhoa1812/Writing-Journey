export const MODE_STORAGE_KEY = 'writing-mode';

const ieltsTraits = (taskLabel) => [
  { key: 'TR', max: 9, label: taskLabel },
  { key: 'CC', max: 9, label: 'Coherence and cohesion' },
  { key: 'LR', max: 9, label: 'Lexical resource' },
  { key: 'GR', max: 9, label: 'Grammatical range and accuracy' },
];

export const examModes = {
  IELTS: {
    label: 'IELTS',
    targetLabel: 'Target band',
    scoreLabel: 'Practice band',
    targetValues: ['4.5', '5.0', '5.5', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0'],
    defaultTarget: '7.0',
    scoreMax: 9,
    scorePrecision: 1,
    chatPlaceholder: 'Ask about this report or IELTS writing...',
    questionPlaceholder: 'Paste the IELTS question here.',
    tasks: {
      1: {
        label: 'Part 1',
        minWords: 150,
        guidance: 'at least 150 words',
        timeMinutes: 20,
        traits: ieltsTraits('Task achievement'),
      },
      2: {
        label: 'Part 2',
        minWords: 250,
        guidance: 'at least 250 words',
        timeMinutes: 40,
        traits: ieltsTraits('Task response'),
      },
    },
  },
  PTE: {
    label: 'PTE',
    targetLabel: 'Score-report goal',
    scoreLabel: 'Item points',
    targetValues: ['10', '20', '30', '36', '42', '50', '58', '65', '73', '79', '84', '90'],
    defaultTarget: '65',
    scoreMax: 26,
    scorePrecision: 0,
    chatPlaceholder: 'Ask about this report or PTE writing...',
    questionPlaceholder: 'Paste the PTE writing prompt here.',
    tasks: {
      1: {
        label: 'Summarize Written Text',
        minWords: 5,
        maxWords: 75,
        oneSentence: true,
        guidance: '5-75 words, one sentence',
        timeMinutes: 10,
        traits: [
          { key: 'Content', max: 4, label: 'Content' },
          { key: 'Form', max: 1, label: 'Form' },
          { key: 'Grammar', max: 2, label: 'Grammar' },
          { key: 'Vocabulary', max: 2, label: 'Vocabulary' },
        ],
      },
      2: {
        label: 'Write Essay',
        minWords: 200,
        maxWords: 300,
        guidance: '200-300 words for full Form credit',
        timeMinutes: 20,
        traits: [
          { key: 'Content', max: 6, label: 'Content' },
          { key: 'Form', max: 2, label: 'Form' },
          { key: 'Development', max: 6, label: 'Development, structure and coherence' },
          { key: 'Grammar', max: 2, label: 'Grammar' },
          { key: 'LinguisticRange', max: 6, label: 'General linguistic range' },
          { key: 'Vocabulary', max: 2, label: 'Vocabulary range' },
          { key: 'Spelling', max: 2, label: 'Spelling' },
        ],
      },
    },
  },
};

export const criterionLabels = {
  TR: 'Task response',
  CC: 'Coherence and cohesion',
  LR: 'Lexical resource',
  GR: 'Grammatical range and accuracy',
  Content: 'Content',
  Form: 'Form',
  Grammar: 'Grammar',
  Vocabulary: 'Vocabulary range',
  Development: 'Development, structure and coherence',
  LinguisticRange: 'General linguistic range',
  Spelling: 'Spelling',
};

export function wordCount(text = '') {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

export function sentenceCount(text = '') {
  return String(text).split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length;
}
