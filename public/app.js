const form = document.getElementById('ielts-form');
const bandSelect = document.getElementById('band-select');
const partSelect = document.getElementById('part-select');
const questionInput = document.getElementById('question-input');
const questionDisplay = document.getElementById('question-display');
const imageInput = document.getElementById('image-input');
const imageFileName = document.getElementById('image-file-name');
const imagePreview = document.getElementById('image-preview');
const answerInput = document.getElementById('answer-input');
const resultSection = document.getElementById('result-section');
const emptyState = document.getElementById('empty-state');
const loadingState = document.getElementById('loading-state');
const reportContent = document.getElementById('report-content');
const submitBtn = document.getElementById('submit-btn');
const wordCountDiv = document.getElementById('word-count');
const exportContainer = document.getElementById('export-container');
const exportPdfBtn = document.getElementById('export-pdf-btn');
const themeToggle = document.getElementById('theme-toggle');
const generateQuestionBtn = document.getElementById('generate-question-btn');
const modeRadios = [...document.querySelectorAll('input[name="writing-mode"]')];
const reportChatInput = document.getElementById('chatbox-input');

const MODE_STORAGE_KEY = 'writing-mode';
// Motivation vs Logic: IELTS and PTE share the same writing workflow, but their labels,
// score scales, task names, and word rules differ; keeping this UI metadata together lets
// the mode switch update the form consistently instead of scattering exam checks everywhere.
const examModes = {
  IELTS: {
    label: 'IELTS',
    eyebrow: 'IELTS writing coach',
    targetLabel: 'Desired Band',
    targetPlaceholder: 'Select Band',
    targetValues: ['4.5', '5.0', '5.5', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0'],
    defaultTarget: '7.0',
    scoreLabel: 'Estimated band',
    scoreMax: 9,
    scorePrecision: 1,
    chatPlaceholder: 'Ask about this report or IELTS writing...',
    questionPlaceholder: 'Paste or type your IELTS question here...',
    tasks: {
      1: { label: 'Part 1', minWords: 150, guidance: 'at least 150 words' },
      2: { label: 'Part 2', minWords: 250, guidance: 'at least 250 words' },
    },
  },
  PTE: {
    label: 'PTE',
    eyebrow: 'PTE writing coach',
    targetLabel: 'Target Score',
    targetPlaceholder: 'Select Score',
    targetValues: ['10', '20', '30', '36', '42', '50', '58', '65', '73', '79', '84', '90'],
    defaultTarget: '65',
    scoreLabel: 'Estimated score',
    scoreMax: 90,
    scorePrecision: 0,
    chatPlaceholder: 'Ask about this report or PTE writing...',
    questionPlaceholder: 'Paste or type your PTE writing prompt here...',
    tasks: {
      1: { label: 'Summarize Written Text', minWords: 5, maxWords: 75, oneSentence: true, guidance: '5-75 words, one sentence' },
      2: { label: 'Write Essay', minWords: 200, maxWords: 300, guidance: '200-300 words' },
    },
  },
};

const loaderTips = [
  'The examiner agent is separating score evidence from style preference.',
  'The diagnosis agent is looking for root causes, not just surface edits.',
  'The correction coach is turning mistakes into reusable rules.',
  'The synthesis agent is building a target-band action plan.',
];

let loaderTipInterval = null;
let currentTipIndex = 0;
let latestEvaluationContext = null;
let currentMode = 'IELTS';

function qs(id) {
  return document.getElementById(id);
}

function createEl(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function clear(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function appendEmpty(container, message) {
  clear(container);
  container.appendChild(createEl('p', 'muted', message));
}

function setText(id, text) {
  qs(id).textContent = text || '';
}

function escapeHTML(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderSafeMarkdown(md = '') {
  const escaped = escapeHTML(md);
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.*?)~~/g, '<del>$1</del>')
    .replace(/\n/g, '<br>');
}

function renderCorrectedDraft(text = '') {
  const tagPattern = /<->([\s\S]*?)<\/->|<\+>([\s\S]*?)<\/\+>/g;
  let lastIndex = 0;
  let match;
  let html = '';
  const escapePlain = (s) => escapeHTML(s).replace(/\n/g, '<br>');
  while ((match = tagPattern.exec(text)) !== null) {
    html += escapePlain(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      html += `<span class="correction-del">${escapeHTML(match[1])}</span>`;
    } else {
      html += `<span class="correction-ins">${escapeHTML(match[2])}</span>`;
    }
    lastIndex = match.index + match[0].length;
  }
  html += escapePlain(text.slice(lastIndex));
  return html;
}

function getWordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getModeConfig() {
  return examModes[currentMode] || examModes.IELTS;
}

function getTaskConfig() {
  const config = getModeConfig();
  return config.tasks[partSelect.value || '1'] || config.tasks['1'];
}

function populateOptions(select, values, placeholder, preferredValue, fallbackValue) {
  clear(select);
  select.appendChild(createEl('option', '', placeholder));
  select.firstChild.value = '';
  values.forEach((value) => {
    const option = createEl('option', '', value);
    option.value = value;
    select.appendChild(option);
  });
  select.value = values.includes(preferredValue) ? preferredValue : fallbackValue;
}

function populateTaskOptions(preferredPart) {
  const config = getModeConfig();
  clear(partSelect);
  const placeholder = createEl('option', '', 'Select Task');
  placeholder.value = '';
  partSelect.appendChild(placeholder);
  Object.entries(config.tasks).forEach(([value, task]) => {
    const option = createEl('option', '', task.label);
    option.value = value;
    partSelect.appendChild(option);
  });
  partSelect.value = config.tasks[preferredPart] ? preferredPart : '';
}

function applyMode(mode) {
  const previousPart = partSelect.value || '2';
  currentMode = examModes[mode] ? mode : 'IELTS';
  const config = getModeConfig();
  localStorage.setItem(MODE_STORAGE_KEY, currentMode);
  modeRadios.forEach((radio) => {
    radio.checked = radio.value === currentMode;
  });
  setText('mode-eyebrow', config.eyebrow);
  setText('target-label', config.targetLabel);
  setText('part-label', currentMode === 'PTE' ? 'Writing Task' : 'Writing Part');
  setText('score-eyebrow', config.scoreLabel);
  questionDisplay.dataset.placeholder = config.questionPlaceholder;
  if (reportChatInput) reportChatInput.placeholder = config.chatPlaceholder;
  populateOptions(bandSelect, config.targetValues, config.targetPlaceholder, bandSelect.value || config.defaultTarget, config.defaultTarget);
  populateTaskOptions(previousPart);
  updateWordCount();
}

function initMode() {
  applyMode(localStorage.getItem(MODE_STORAGE_KEY) || 'IELTS');
}

function updateWordCount() {
  const task = getTaskConfig();
  const count = getWordCount(answerInput.value);
  const tooShort = count < task.minWords;
  const tooLong = task.maxWords && count > task.maxWords;
  wordCountDiv.textContent = `${count} words · ${task.guidance}`;
  wordCountDiv.className = tooShort || tooLong ? 'word-count warn' : 'word-count ok';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === 'dark' ? '☀' : '☾';
  localStorage.setItem('ielts-theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('ielts-theme');
  const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || preferred);
}

function setFormDisabled(disabled) {
  [bandSelect, partSelect, imageInput, answerInput, submitBtn, generateQuestionBtn, ...modeRadios].forEach((field) => {
    field.disabled = disabled;
  });
  questionDisplay.contentEditable = disabled ? 'false' : 'true';
  submitBtn.textContent = disabled ? 'Evaluating...' : 'Evaluate deeply';
}

function setLoaderTip(index) {
  const tipEl = qs('loader-tip');
  tipEl.classList.add('tip-out');
  setTimeout(() => {
    tipEl.textContent = loaderTips[index];
    tipEl.classList.remove('tip-out');
  }, 240);
  document.querySelectorAll('.loader-agent').forEach((agent, i) => {
    agent.classList.toggle('agent-active', i === index);
    agent.classList.toggle('agent-done', i < index);
  });
}

function startLoader() {
  clearInterval(loaderTipInterval);
  currentTipIndex = 0;
  setLoaderTip(0);
  loaderTipInterval = setInterval(() => {
    currentTipIndex = (currentTipIndex + 1) % loaderTips.length;
    setLoaderTip(currentTipIndex);
  }, 2200);
}

function stopLoader() {
  clearInterval(loaderTipInterval);
  loaderTipInterval = null;
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderCriterionBars(data) {
  const container = qs('criterion-bars');
  clear(container);
  const criteria = Object.keys(data.criteria || {});
  const scaleMax = data.scoreScale?.max || getModeConfig().scoreMax;
  const precision = data.scoreScale?.precision ?? getModeConfig().scorePrecision;
  criteria.forEach((key) => {
    const value = Number(data[key] || data.criteria?.[key]?.score || 0);
    const item = createEl('div', 'criterion-bar');
    const label = createEl('div', 'criterion-bar-label');
    label.append(createEl('span', '', key), createEl('strong', '', value ? value.toFixed(precision) : '-'));
    const track = createEl('div', 'bar-track');
    const fill = createEl('div', 'bar-fill');
    fill.style.width = `${Math.max(0, Math.min(100, (value / scaleMax) * 100))}%`;
    track.appendChild(fill);
    item.append(label, track);
    container.appendChild(item);
  });
}

function renderOverview(data) {
  setText('overview-output', data.overview || 'Your answer has been reviewed by the specialist agents.');

  const gap = qs('target-gap-output');
  clear(gap);
  (data.targetBandGap || []).forEach((item) => gap.appendChild(createEl('span', 'chip', item)));
  if (!gap.children.length) gap.appendChild(createEl('span', 'chip', 'No target-score gap supplied'));

  const priorities = qs('priority-output');
  clear(priorities);
  (data.topPriorities || []).forEach((item, index) => {
    const row = createEl('div', 'priority-item');
    row.append(createEl('span', 'priority-number', String(index + 1)), createEl('p', '', item));
    priorities.appendChild(row);
  });
}

function renderCriteria(data) {
  const container = qs('criteria-output');
  clear(container);
  const labels = {
    TR: 'Task Response',
    CC: 'Coherence & Cohesion',
    LR: 'Lexical Resource',
    GR: 'Grammar Range & Accuracy',
    Content: 'Content',
    Form: 'Form',
    Grammar: 'Grammar',
    Vocabulary: 'Vocabulary',
    Coherence: 'Coherence',
  };
  Object.keys(data.criteria || {}).forEach((key) => {
    const precision = data.scoreScale?.precision ?? getModeConfig().scorePrecision;
    const label = labels[key] || key;
    const detail = data.criteria?.[key] || {};
    const card = createEl('article', 'criterion-card');
    card.append(createEl('h3', '', `${key} · ${label}`));
    card.append(createEl('strong', 'band-pill', `${Number(data[key] || detail.score || 0).toFixed(precision)}`));
    card.append(createEl('p', '', detail.reason || data[`${key}_reason`] || 'No reason supplied.'));
    const list = createEl('ul', 'compact-list');
    (detail.evidence || []).forEach((evidence) => list.appendChild(createEl('li', '', evidence)));
    card.appendChild(list);
    if (detail.nextStep) card.append(createEl('p', 'next-step', detail.nextStep));
    container.appendChild(card);
  });
}

function renderSentenceInsights(items = []) {
  const container = qs('sentence-output');
  clear(container);
  if (!items.length) return appendEmpty(container, 'No sentence-level insights were supplied.');
  items.forEach((item) => {
    const issueType = item.issueType || 'Issue';
    const hasIssue = !/^no[\s_-]*issue/i.test(issueType);
    if (hasIssue) {
      const detail = createEl('details', 'sentence-card');
      const summary = createEl('summary');
      summary.append(createEl('span', 'issue-tag', issueType));
      summary.append(createEl('strong', '', item.original || `Sentence ${item.sentenceNumber}`));
      detail.appendChild(summary);
      detail.append(createEl('p', 'revision', item.revised || 'No revision supplied.'));
      detail.append(createEl('p', '', `Why: ${item.whyWrong || 'No explanation provided.'}`));
      detail.append(createEl('p', 'principle', `Rule: ${item.principle || 'Revise for clearer control.'}`));
      container.appendChild(detail);
    } else {
      const card = createEl('div', 'sentence-card');
      const row = createEl('div', 'sentence-card-row');
      row.append(createEl('span', 'chip', issueType));
      row.append(createEl('span', '', item.original || `Sentence ${item.sentenceNumber}`));
      card.appendChild(row);
      container.appendChild(card);
    }
  });
}

function renderIdeaAndCohesion(data) {
  const idea = qs('idea-output');
  clear(idea);
  if (!(data.ideaInsights || []).length) appendEmpty(idea, 'No idea-depth notes were supplied.');
  (data.ideaInsights || []).forEach((item) => {
    const card = createEl('article', 'mini-card');
    card.append(createEl('h3', '', item.originalIdea || 'Idea'));
    card.append(createEl('p', '', item.problem || 'Problem not supplied.'));
    card.append(createEl('p', 'next-step', item.deeperAlternative || 'Develop this idea more specifically.'));
    idea.appendChild(card);
  });

  const cohesion = qs('cohesion-output');
  clear(cohesion);
  if (!(data.cohesionMap || []).length) appendEmpty(cohesion, 'No coherence map was supplied.');
  (data.cohesionMap || []).forEach((item) => {
    const row = createEl('div', 'flow-item');
    row.append(createEl('span', 'flow-step', String(item.step)));
    const body = createEl('div');
    body.append(createEl('strong', '', item.role || 'Step'));
    body.append(createEl('p', '', item.linkQuality || 'Link quality not supplied.'));
    body.append(createEl('p', 'next-step', item.improvement || 'Clarify the transition.'));
    row.appendChild(body);
    cohesion.appendChild(row);
  });
}

function renderTables(data) {
  const vocab = qs('vocab-output');
  clear(vocab);
  if (!(data.vocabularyUpgrades || []).length) {
    appendEmpty(vocab, 'No vocabulary upgrades were supplied.');
  } else {
    const table = createEl('table', 'insight-table');
    table.innerHTML = '<thead><tr><th>Original</th><th>Upgrade</th><th>Why</th></tr></thead>';
    const tbody = createEl('tbody');
    data.vocabularyUpgrades.forEach((item) => {
      const row = createEl('tr');
      row.append(createEl('td', '', item.original), createEl('td', '', item.upgrade), createEl('td', '', item.reason));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    vocab.appendChild(table);
  }

  const grammar = qs('grammar-output');
  clear(grammar);
  if (!(data.grammarPatterns || []).length) appendEmpty(grammar, 'No grammar patterns were supplied.');
  (data.grammarPatterns || []).forEach((item) => {
    const card = createEl('article', 'mini-card');
    card.append(createEl('h3', '', item.pattern || 'Pattern'));
    card.append(createEl('p', '', item.problem || 'Problem not supplied.'));
    card.append(createEl('p', 'next-step', item.exampleFix || 'No example fix supplied.'));
    grammar.appendChild(card);
  });
}

function renderModelAndPractice(data) {
  qs('correction-output').innerHTML = renderCorrectedDraft(data.correction || '');
  const correctionNotes = qs('correction-notes-output');
  clear(correctionNotes);
  (data.correctionNotes || []).forEach((note) => correctionNotes.appendChild(createEl('li', '', note)));
  qs('model-answer-output').innerHTML = renderSafeMarkdown(data.modelAnswer || '');

  const notes = qs('model-notes-output');
  clear(notes);
  (data.modelAnswerNotes || []).forEach((note) => notes.appendChild(createEl('li', '', note)));

  const practice = qs('practice-output');
  clear(practice);
  (data.practicePlan || []).forEach((item) => {
    const card = createEl('article', 'practice-card');
    card.append(createEl('span', 'priority-number', String(item.priority)));
    card.append(createEl('h3', '', item.focus || 'Practice focus'));
    card.append(createEl('p', '', item.drill || 'No drill supplied.'));
    card.append(createEl('p', 'next-step', item.successSignal || 'Success signal not supplied.'));
    practice.appendChild(card);
  });
}

function renderTrace(data) {
  const trace = qs('agent-trace-output');
  if (!trace) return;
  clear(trace);
  (data.agentTraceSummary || []).forEach((item) => {
    const card = createEl('div', item.ok ? 'trace-card ok' : 'trace-card warn');
    card.append(createEl('strong', '', item.name || 'Agent'));
    card.append(createEl('span', '', `${item.attempts || 0} attempt${item.attempts === 1 ? '' : 's'}`));
    card.append(createEl('span', '', item.ok ? 'validated' : 'fallback used'));
    trace.appendChild(card);
  });
}

function renderReport(data) {
  latestEvaluationContext = data;
  window.latestEvaluationContext = data;
  const precision = data.scoreScale?.precision ?? getModeConfig().scorePrecision;
  qs('score-label').textContent = Number(data.score || 0).toFixed(precision);
  renderCriterionBars(data);
  renderOverview(data);
  renderCriteria(data);
  renderSentenceInsights(data.sentenceInsights || []);
  renderIdeaAndCohesion(data);
  renderTables(data);
  renderModelAndPractice(data);
  renderTrace(data);
  exportContainer.classList.remove('hidden');
}

async function exportToPDF() {
  exportPdfBtn.disabled = true;
  exportPdfBtn.textContent = 'Generating...';
  try {
    const canvas = await html2canvas(reportContent, {
      scale: 2,
      useCORS: true,
      backgroundColor: getComputedStyle(document.body).getPropertyValue('--surface'),
    });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgWidth = 210;
    const pageHeight = 295;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(canvas, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(canvas, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(`${getModeConfig().label}_Evaluation_${new Date().toISOString().slice(0, 10)}.pdf`);
  } finally {
    exportPdfBtn.disabled = false;
    exportPdfBtn.textContent = 'Export PDF';
  }
}

imageInput.addEventListener('change', () => {
  clear(imagePreview);
  const file = imageInput.files[0];
  imageFileName.textContent = file ? file.name : 'No image selected';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = createEl('img');
    img.src = event.target.result;
    img.alt = 'Question preview';
    imagePreview.appendChild(img);
  };
  reader.readAsDataURL(file);
});

answerInput.addEventListener('input', updateWordCount);
partSelect.addEventListener('change', updateWordCount);
themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
modeRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.checked) applyMode(radio.value);
  });
});

function formatGeneratedQuestion(data) {
  const parts = [];
  if (data.sourceText) parts.push(`Source Text:\n${data.sourceText}`);
  if (data.question) parts.push(data.question);
  if (data.recommendedWords || data.timeMinutes) {
    parts.push([
      data.recommendedWords ? `Recommended words: ${data.recommendedWords}` : '',
      data.timeMinutes ? `Time: ${data.timeMinutes} minutes` : '',
    ].filter(Boolean).join('\n'));
  }
  return parts.filter(Boolean).join('\n\n');
}

async function generateQuestion() {
  const part = partSelect.value || '1';
  generateQuestionBtn.disabled = true;
  generateQuestionBtn.textContent = 'Generating...';
  try {
    const response = await fetch('/generate-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: currentMode, part }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Question generation failed');
    setQuestionText(formatGeneratedQuestion(data));
  } catch (error) {
    window.alert(error.message || 'Could not generate a question. Please try again.');
  } finally {
    generateQuestionBtn.disabled = false;
    generateQuestionBtn.textContent = 'Generate Question';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const part = partSelect.value || '1';
  const task = getTaskConfig();
  const count = getWordCount(answerInput.value);
  const tooShort = count < task.minWords;
  const tooLong = task.maxWords && count > task.maxWords;
  const sentenceCount = answerInput.value.split(/[.!?]+/).map((sentence) => sentence.trim()).filter(Boolean).length;
  if (task.oneSentence && sentenceCount > 1 && !window.confirm('PTE Summarize Written Text should be one sentence. Continue?')) {
    return;
  }
  if ((tooShort || tooLong) && !window.confirm(`Your answer is outside the recommended range (${task.guidance}). Continue?`)) {
    return;
  }

  setFormDisabled(true);
  resultSection.classList.remove('hidden');
  emptyState.classList.add('hidden');
  loadingState.classList.remove('hidden');
  reportContent.classList.add('hidden');
  exportContainer.classList.add('hidden');
  startLoader();

  try {
    let imageBase64 = '';
    if (imageInput.files[0]) imageBase64 = await toBase64(imageInput.files[0]);
    const response = await fetch('/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: currentMode,
        targetScore: bandSelect.value,
        band: bandSelect.value,
        part,
        question: questionDisplay.textContent || questionInput.value,
        answer: answerInput.value,
        image: imageBase64,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Evaluation failed');
    renderReport(data);
    reportContent.classList.remove('hidden');
  } catch (error) {
    reportContent.classList.remove('hidden');
    setText('overview-output', error.message || 'Could not get evaluation. Please try again.');
  } finally {
    stopLoader();
    loadingState.classList.add('hidden');
    setFormDisabled(false);
  }
});

const showNoteBtn = document.getElementById('show-note-btn');
const hideNoteBtn = document.getElementById('hide-note-btn');
const noteCard = document.getElementById('note-card');
showNoteBtn.addEventListener('click', () => {
  noteCard.classList.remove('hidden');
  showNoteBtn.classList.add('hidden');
});
hideNoteBtn.addEventListener('click', () => {
  noteCard.classList.add('hidden');
  showNoteBtn.classList.remove('hidden');
});
exportPdfBtn.addEventListener('click', exportToPDF);
generateQuestionBtn.addEventListener('click', generateQuestion);

// Answer expand modal
const expandAnswerBtn = document.getElementById('expand-answer-btn');
const collapseAnswerBtn = document.getElementById('collapse-answer-btn');
const answerModalOverlay = document.getElementById('answer-modal-overlay');
const answerModalInput = document.getElementById('answer-modal-input');
const answerModalWordCount = document.getElementById('answer-modal-word-count');

function updateModalWordCount() {
  const task = getTaskConfig();
  const count = getWordCount(answerModalInput.value);
  const tooShort = count < task.minWords;
  const tooLong = task.maxWords && count > task.maxWords;
  answerModalWordCount.textContent = `${count} words · ${task.guidance}`;
  answerModalWordCount.className = tooShort || tooLong ? 'word-count warn answer-modal-word-count' : 'word-count ok answer-modal-word-count';
}

function closeAnswerModal() {
  answerModalOverlay.classList.add('hidden');
}

expandAnswerBtn.addEventListener('click', () => {
  answerModalInput.value = answerInput.value;
  updateModalWordCount();
  answerModalOverlay.classList.remove('hidden');
  answerModalInput.focus();
});

collapseAnswerBtn.addEventListener('click', closeAnswerModal);

answerModalOverlay.addEventListener('click', (e) => {
  if (e.target === answerModalOverlay) closeAnswerModal();
});

answerModalInput.addEventListener('input', () => {
  answerInput.value = answerModalInput.value;
  updateWordCount();
  updateModalWordCount();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !answerModalOverlay.classList.contains('hidden')) {
    closeAnswerModal();
  }
});

// --- Question display helpers ---

function setQuestionText(text) {
  questionDisplay.textContent = text;
  questionInput.value = text;
  if (window.AnnotationSystem) {
    window.AnnotationSystem.loadAnnotations(questionDisplay);
  }
}

questionDisplay.addEventListener('input', () => {
  questionInput.value = questionDisplay.textContent;
  if (window.AnnotationSystem) window.AnnotationSystem.saveAnnotations(questionDisplay);
});

// --- Annotation toolbar wiring ---
document.getElementById('btn-highlight').addEventListener('click', () => {
  if (window.AnnotationSystem) window.AnnotationSystem.applyHighlight(questionDisplay);
});

document.getElementById('btn-underline').addEventListener('click', () => {
  if (window.AnnotationSystem) window.AnnotationSystem.applyUnderline(questionDisplay);
});

// Init annotation system after DOM is ready
if (window.AnnotationSystem) {
  window.AnnotationSystem.init(
    questionDisplay,
    document.getElementById('note-popup'),
    document.getElementById('note-popup-text'),
    document.getElementById('note-popup-save'),
    document.getElementById('note-popup-cancel'),
    document.getElementById('note-popup-delete'),
  );
}

initTheme();
initMode();
updateWordCount();
