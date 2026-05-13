function extractJson(text) {
  if (text && typeof text === 'object') return text;
  if (typeof text !== 'string') return null;

  let cleaned = text.trim().replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  const candidates = [
    cleaned,
    cleaned.replace(/,\s*([}\]])/g, '$1'),
    cleaned
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([0-9\]\}"])(\s*\n\s*")/g, '$1,\n"'),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      // Try the next cleanup candidate.
    }
  }

  return null;
}

function coerceString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function coerceArray(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  coerceArray,
  coerceString,
  extractJson,
};
