const form = document.getElementById('ielts-form');
const bandSelect = document.getElementById('band-select');
const partSelect = document.getElementById('part-select');
const questionInput = document.getElementById('question-input');
const imageInput = document.getElementById('image-input');
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

const loaderTips = [
  'The examiner agent is separating score evidence from style preference.',
  'The diagnosis agent is looking for root causes, not just surface edits.',
  'The correction coach is turning mistakes into reusable rules.',
  'The synthesis agent is building a target-band action plan.',
];

let loaderTipInterval = null;
let currentTipIndex = 0;
let latestEvaluationContext = null;

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

function getWordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function updateWordCount() {
  const part = partSelect.value || '1';
  const minWords = part === '2' ? 250 : 150;
  const count = getWordCount(answerInput.value);
  wordCountDiv.textContent = `${count}/${minWords} words`;
  wordCountDiv.className = count < minWords ? 'word-count warn' : 'word-count ok';
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
  [bandSelect, partSelect, questionInput, imageInput, answerInput, submitBtn].forEach((field) => {
    field.disabled = disabled;
  });
  submitBtn.textContent = disabled ? 'Evaluating...' : 'Evaluate deeply';
}

function startLoader() {
  clearInterval(loaderTipInterval);
  currentTipIndex = 0;
  qs('loader-tip').textContent = loaderTips[0];
  loaderTipInterval = setInterval(() => {
    currentTipIndex = (currentTipIndex + 1) % loaderTips.length;
    qs('loader-tip').textContent = loaderTips[currentTipIndex];
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
  ['TR', 'CC', 'LR', 'GR'].forEach((key) => {
    const value = Number(data[key] || data.criteria?.[key]?.score || 0);
    const item = createEl('div', 'criterion-bar');
    const label = createEl('div', 'criterion-bar-label');
    label.append(createEl('span', '', key), createEl('strong', '', value ? value.toFixed(1) : '-'));
    const track = createEl('div', 'bar-track');
    const fill = createEl('div', 'bar-fill');
    fill.style.width = `${Math.max(0, Math.min(100, (value / 9) * 100))}%`;
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
  if (!gap.children.length) gap.appendChild(createEl('span', 'chip', 'No target-band gap supplied'));

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
  };
  Object.entries(labels).forEach(([key, label]) => {
    const detail = data.criteria?.[key] || {};
    const card = createEl('article', 'criterion-card');
    card.append(createEl('h3', '', `${key} · ${label}`));
    card.append(createEl('strong', 'band-pill', `${Number(data[key] || detail.score || 0).toFixed(1)}`));
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
    const detail = createEl('details', 'sentence-card');
    const summary = createEl('summary');
    summary.append(createEl('span', 'issue-tag', item.issueType || 'Issue'));
    summary.append(createEl('strong', '', item.original || `Sentence ${item.sentenceNumber}`));
    detail.appendChild(summary);
    detail.append(createEl('p', 'revision', item.revised || 'No revision supplied.'));
    detail.append(createEl('p', '', `Why: ${item.whyWrong || 'This weakens accuracy or clarity.'}`));
    detail.append(createEl('p', 'principle', `Rule: ${item.principle || 'Revise for clearer control.'}`));
    container.appendChild(detail);
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
  qs('correction-output').innerHTML = renderSafeMarkdown(data.correction || '');
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
  qs('score-label').textContent = Number(data.score || 0).toFixed(1);
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
    pdf.save(`IELTS_Evaluation_${new Date().toISOString().slice(0, 10)}.pdf`);
  } finally {
    exportPdfBtn.disabled = false;
    exportPdfBtn.textContent = 'Export PDF';
  }
}

imageInput.addEventListener('change', () => {
  clear(imagePreview);
  const file = imageInput.files[0];
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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const part = partSelect.value || '1';
  const minWords = part === '2' ? 250 : 150;
  const count = getWordCount(answerInput.value);
  if (count < minWords && !window.confirm(`Your answer is below the recommended word count (${minWords} words). Continue?`)) {
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
        band: bandSelect.value,
        part,
        question: questionInput.value,
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

initTheme();
updateWordCount();
