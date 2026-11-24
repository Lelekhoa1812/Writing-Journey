export function escapeHTML(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderSafeMarkdown(md = '') {
  return escapeHTML(md)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.*?)~~/g, '<del>$1</del>')
    .replace(/\n/g, '<br>');
}

export function renderCorrectedDraft(text = '') {
  const safe = text
    .replace(/<->/g, '\x01')
    .replace(/<\/->/g, '\x02')
    .replace(/<\+>/g, '\x03')
    .replace(/<\/\+>/g, '\x04');
  const escaped = escapeHTML(safe).replace(/\n/g, '<br>');
  return escaped
    .replace(/\x01([\s\S]*?)\x02/g, '<span class="text-warn line-through">$1</span>')
    .replace(/\x03([\s\S]*?)\x04/g, '<span class="text-good font-semibold">$1</span>')
    .replace(/[\x01-\x04]/g, '');
}

export function escapeMessage(value = '') {
  return escapeHTML(value).replace(/\n/g, '<br>');
}
