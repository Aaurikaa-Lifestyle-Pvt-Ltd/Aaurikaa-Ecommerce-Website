/**
 * WS-1 / 1.7 — features[] write helpers.
 *
 * Persisted row (additive):
 *   { key, value, code?, values? }
 *   - key   = existing human-readable display label (never rewritten to catalogue code)
 *   - value = single product value, or first selected value (legacy consumers)
 *   - code  = KeyFeatureCatalogue.code (stable identity; omitted on legacy rows)
 *   - values = multi-select values when more than one; never a comma-separated string
 *
 * Legacy `{ key, value }` records pass through unchanged (no code, no values).
 * `catalogueCode` on inbound editor payloads is accepted as an alias of `code`.
 */

function parseFeaturesInput(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function uniquePreserveOrder(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/**
 * Collect product values from `values[]` and/or `value`.
 * Does not split comma-separated strings.
 */
function collectFeatureValues(row) {
  const fromArray = Array.isArray(row?.values)
    ? row.values.map((v) => String(v ?? '').trim()).filter(Boolean)
    : [];
  if (fromArray.length > 0) return uniquePreserveOrder(fromArray);
  const fromValue = String(row?.value ?? '').trim();
  return fromValue ? [fromValue] : [];
}

function getFeatureValues(feature) {
  return collectFeatureValues(feature);
}

function getFeatureScalarValue(feature) {
  const values = collectFeatureValues(feature);
  return values[0] || '';
}

/**
 * Filter empty rows and trim strings. Does not rewrite key identity.
 * @param {unknown} raw
 * @returns {{ key: string, value: string, code?: string, values?: string[] }[]}
 */
function normalizeFeaturesForWrite(raw) {
  return parseFeaturesInput(raw)
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const key = String(row.key ?? '').trim();
      const values = collectFeatureValues(row);
      if (!key || values.length === 0) return null;

      const code = String(row.code ?? row.catalogueCode ?? '').trim();
      const out = { key, value: values[0] };
      if (code) out.code = code;
      if (values.length > 1) out.values = values;
      return out;
    })
    .filter(Boolean);
}

module.exports = {
  parseFeaturesInput,
  collectFeatureValues,
  getFeatureValues,
  getFeatureScalarValue,
  normalizeFeaturesForWrite,
};
