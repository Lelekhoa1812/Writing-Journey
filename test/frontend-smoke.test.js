const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('frontend exposes theme toggle and structured report containers', () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  [
    'theme-toggle',
    'generate-question-btn',
    'score-eyebrow',
    'criterion-bars',
    'sentence-output',
    'idea-output',
    'cohesion-output',
    'vocab-output',
    'grammar-output',
  ].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
});

test('frontend exposes IELTS/PTE mode switching and localStorage preference', () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  assert.match(html, /name="writing-mode" value="IELTS"/);
  assert.match(html, /name="writing-mode" value="PTE"/);
  assert.match(app, /MODE_STORAGE_KEY = 'writing-mode'/);
  assert.match(app, /Summarize Written Text/);
  assert.match(app, /Write Essay/);
  assert.match(app, /\/generate-question/);
});

test('frontend stores latest evaluation context for chat follow-ups', () => {
  const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const chat = fs.readFileSync(path.join(root, 'public/chatbox.js'), 'utf8');
  assert.match(app, /window\.latestEvaluationContext = data/);
  assert.match(chat, /evaluationContext: window\.latestEvaluationContext/);
});

test('frontend renders AI-controlled text through escaping helpers', () => {
  const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const chat = fs.readFileSync(path.join(root, 'public/chatbox.js'), 'utf8');
  assert.match(app, /function escapeHTML/);
  assert.match(app, /renderSafeMarkdown/);
  assert.match(chat, /function escapeMessage/);
});
