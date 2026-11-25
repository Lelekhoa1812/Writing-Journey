const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'client', 'src');
const app = fs.readFileSync(path.join(root, 'App.jsx'), 'utf8');
const report = fs.readFileSync(path.join(root, 'components', 'Report.jsx'), 'utf8');
const exam = fs.readFileSync(path.join(root, 'lib', 'exam.js'), 'utf8');
const format = fs.readFileSync(path.join(root, 'lib', 'format.js'), 'utf8');

test('frontend exposes theme toggle and structured report containers', () => {
  ['theme-toggle', 'generate-question-btn', 'timer-toggle'].forEach((id) => {
    assert.match(app, new RegExp(`id="${id}"`));
  });
  ['score-label', 'criterion-bars', 'sentence-output', 'idea-output', 'cohesion-output', 'vocab-output', 'grammar-output', 'diagnosis-output'].forEach((id) => {
    assert.match(report, new RegExp(`id="${id}"`));
  });
});

test('frontend exposes IELTS/PTE mode switching and localStorage preference', () => {
  assert.match(app, /name="writing-mode"/);
  assert.match(app, /\['IELTS', 'PTE'\]/);
  assert.match(exam, /MODE_STORAGE_KEY = 'writing-mode'/);
  assert.match(exam, /Summarize Written Text/);
  assert.match(exam, /Write Essay/);
  assert.match(app, /\/generate-question/);
});

test('frontend stores latest evaluation context for chat follow-ups', () => {
  assert.match(app, /window\.latestEvaluationContext = data/);
  assert.match(app, /evaluationContext: window\.latestEvaluationContext/);
});

test('frontend renders AI-controlled text through escaping helpers', () => {
  assert.match(format, /function escapeHTML/);
  assert.match(format, /renderSafeMarkdown/);
  assert.match(format, /function escapeMessage/);
});
