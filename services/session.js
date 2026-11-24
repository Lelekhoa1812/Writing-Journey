const { getExamConfig, getTaskConfig } = require('./examConfig');
const { getWordCount } = require('./score');

function compactEvaluation(context) {
  if (!context || typeof context !== 'object') return null;
  const criteria = context.criteria && typeof context.criteria === 'object'
    ? Object.fromEntries(Object.entries(context.criteria).slice(0, 6).map(([key, value]) => [key, {
      score: value?.score,
      reason: String(value?.reason || '').slice(0, 240),
      nextStep: String(value?.nextStep || '').slice(0, 180),
    }]))
    : {};
  return {
    mode: context.mode,
    targetScore: context.targetScore || context.band || '',
    taskLabel: context.taskLabel || '',
    part: context.part || '',
    score: context.score,
    overview: String(context.overview || '').slice(0, 700),
    topPriorities: Array.isArray(context.topPriorities) ? context.topPriorities.slice(0, 3) : [],
    criteria,
  };
}

function compactHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-8)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').slice(0, 1200),
    }))
    .filter((item) => item.content);
}

const CHAT_TOOLS = [
  {
    name: 'get_exam_rules',
    description: 'Return the task limits for the active IELTS or PTE writing task.',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', description: 'IELTS or PTE' },
        part: { type: 'string', description: '1 or 2' },
      },
      required: ['mode', 'part'],
    },
  },
  {
    name: 'count_words',
    description: 'Count words in a student draft.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      required: ['text'],
    },
  },
  {
    name: 'get_score_snapshot',
    description: 'Return the compact scores from the latest evaluation.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

function executeChatTool(name, args, context) {
  if (name === 'count_words') {
    const text = String(args.text || '');
    return { words: getWordCount(text) };
  }
  if (name === 'get_exam_rules') {
    const config = getExamConfig(args.mode);
    const task = getTaskConfig(args.mode, args.part);
    return {
      exam: config.label,
      task: task.promptLabel,
      words: task.recommendedWords,
      minutes: task.timeMinutes,
      oneSentence: Boolean(task.oneSentence),
      scoreScale: config.scoreScale,
      criteria: config.criteria,
    };
  }
  if (name === 'get_score_snapshot') {
    return context || { available: false };
  }
  return { error: 'unknown_tool' };
}

module.exports = {
  CHAT_TOOLS,
  compactEvaluation,
  compactHistory,
  executeChatTool,
};
