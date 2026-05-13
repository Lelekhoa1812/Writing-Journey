const chatbotBtn = document.getElementById('draggable-chatbot');
const chatbox = document.getElementById('chatbox');
const closeChatboxBtn = document.getElementById('close-chatbox');
const chatboxForm = document.getElementById('chatbox-form');
const chatboxInput = document.getElementById('chatbox-input');
const chatboxMessages = document.getElementById('chatbox-messages');

window.originalChatbotPos = { bottom: 28, right: 28 };

function escapeMessage(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

function renderAssistantMarkdown(md) {
  return escapeMessage(md)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function openChatbox() {
  if (window.wasDragged) {
    window.wasDragged = false;
    return;
  }
  chatbox.classList.remove('hidden');
  chatbotBtn.style.bottom = `${window.originalChatbotPos.bottom}px`;
  chatbotBtn.style.right = `${window.originalChatbotPos.right}px`;
}

function appendMessage(text, isUser) {
  const div = document.createElement('div');
  div.className = isUser ? 'chatbox-message-user' : 'chatbox-message-ai';
  div.innerHTML = isUser ? escapeMessage(text) : renderAssistantMarkdown(text);
  chatboxMessages.appendChild(div);
  chatboxMessages.scrollTop = chatboxMessages.scrollHeight;
  return div;
}

chatbotBtn.addEventListener('click', openChatbox);
closeChatboxBtn.addEventListener('click', () => chatbox.classList.add('hidden'));

chatboxForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const userMsg = chatboxInput.value.trim();
  if (!userMsg) return;
  appendMessage(userMsg, true);
  chatboxInput.value = '';
  const thinking = appendMessage('Reading your report context...', false);
  try {
    const response = await fetch('/chat-assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMsg,
        evaluationContext: window.latestEvaluationContext || null,
      }),
    });
    const data = await response.json();
    thinking.remove();
    appendMessage(response.ok ? data.reply : data.error || 'Could not get response.', false);
  } catch (error) {
    thinking.remove();
    appendMessage('Could not get a response after retrying. Please try again.', false);
  }
});

chatboxInput.addEventListener('input', function resizeInput() {
  this.style.height = 'auto';
  this.style.height = `${Math.min(this.scrollHeight, 136)}px`;
});
