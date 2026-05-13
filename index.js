const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { assistChat, evaluateWriting, generateQuestion } = require('./services/orchestrator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/evaluate', async (req, res) => {
  try {
    if (!req.body?.answer) {
      return res.status(400).json({ error: 'Answer is required for evaluation.' });
    }
    const report = await evaluateWriting(req.body);
    return res.json(report);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to evaluate answer after retrying the agent workflow.',
      details: err.message,
    });
  }
});

app.post('/generate-question', async (req, res) => {
  try {
    if (!req.body?.mode || !req.body?.part) {
      return res.status(400).json({ error: 'Mode and writing task are required.' });
    }
    const question = await generateQuestion(req.body);
    return res.json(question);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to generate a writing question after retrying.',
      details: err.message,
    });
  }
});

app.post('/chat-assist', async (req, res) => {
  try {
    if (!req.body?.message) {
      return res.status(400).json({ error: 'Message is required.' });
    }
    const reply = await assistChat(req.body);
    return res.json(reply);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to get chat response after retrying.',
      details: err.message,
    });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Writing Journey listening on port ${PORT}`);
  });
}

module.exports = app;
