/**
 * Auto-translation service using Google Cloud Translation API v2 REST.
 * Set GOOGLE_TRANSLATE_API_KEY in .env to enable. Without it, translateText returns null.
 */

const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';

/**
 * Translate a single text string to the target locale.
 * @param {string} text - Source text (English assumed)
 * @param {string} targetLocale - 'bn' or 'hi'
 * @returns {Promise<string|null>} Translated text or null if disabled/failed
 */
async function translateText(text, targetLocale) {
  if (!text || typeof text !== 'string' || !text.trim()) return '';
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return null;
  const target = targetLocale === 'bn' ? 'bn' : targetLocale === 'hi' ? 'hi' : null;
  if (!target) return null;
  try {
    const res = await fetch(`${GOOGLE_TRANSLATE_URL}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: [text.trim()], target }),
    });
    const data = await res.json();
    if (data.error) {
      console.warn('Google Translate API error:', data.error.message);
      return null;
    }
    const translated = data.data?.translations?.[0]?.translatedText;
    return translated != null ? translated : null;
  } catch (err) {
    console.warn('Auto-translate request failed:', err.message);
    return null;
  }
}

/**
 * Translate multiple strings in one request (batch up to 128).
 * @param {string[]} texts - Array of source texts
 * @param {string} targetLocale - 'bn' or 'hi'
 * @returns {Promise<(string|null)[]>} Array of translated strings (null where failed)
 */
async function translateStrings(texts, targetLocale) {
  const filtered = texts.map((t) => (t && typeof t === 'string' ? t.trim() : '')).filter(Boolean);
  if (filtered.length === 0) return texts.map(() => '');
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return texts.map(() => null);
  const target = targetLocale === 'bn' ? 'bn' : targetLocale === 'hi' ? 'hi' : null;
  if (!target) return texts.map(() => null);
  try {
    const res = await fetch(`${GOOGLE_TRANSLATE_URL}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: filtered, target }),
    });
    const data = await res.json();
    if (data.error) {
      console.warn('Google Translate API error:', data.error.message);
      return texts.map(() => null);
    }
    const translations = data.data?.translations || [];
    const results = [];
    let j = 0;
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      if (!t || typeof t !== 'string' || !t.trim()) {
        results.push('');
      } else {
        results.push(translations[j]?.translatedText ?? null);
        j++;
      }
    }
    return results;
  } catch (err) {
    console.warn('Auto-translate batch failed:', err.message);
    return texts.map(() => null);
  }
}

function isConfigured() {
  return !!process.env.GOOGLE_TRANSLATE_API_KEY;
}

module.exports = { translateText, translateStrings, isConfigured };
