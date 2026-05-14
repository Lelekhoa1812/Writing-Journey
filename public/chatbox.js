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

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function appendMessage(text, isUser) {
  const div = document.createElement('div');
  div.className = isUser ? 'chatbox-message-user' : 'chatbox-message-ai';
  div.innerHTML = isUser ? escapeMessage(text) : renderAssistantMarkdown(text);
  if (!isUser) {
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'copy-msg-btn';
    copyBtn.title = 'Copy response';
    copyBtn.setAttribute('aria-label', 'Copy response');
    copyBtn.innerHTML = COPY_ICON;
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.innerHTML = CHECK_ICON;
        setTimeout(() => { copyBtn.innerHTML = COPY_ICON; }, 1500);
      });
    });
    div.appendChild(copyBtn);
  }
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
