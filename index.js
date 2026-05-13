const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { assistChat, evaluateWriting } = require('./services/orchestrator');

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
    console.log(`IELTS Enhancer listening on port ${PORT}`);
  });
}

module.exports = app;
