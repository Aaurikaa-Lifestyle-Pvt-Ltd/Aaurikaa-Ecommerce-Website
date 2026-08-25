const Translation = require('../models/Translation');

function deepMerge(target, source) {
  for (const key in source) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/**
 * Apply translations to documents for a given locale.
 * @param {Object|Object[]} documents - Single document or array of documents (plain objects or Mongoose docs)
 * @param {string} modelName - Model name (e.g. 'Product', 'Category')
 * @param {string} locale - Locale code ('bn' or 'hi'). If 'en' or missing, returns documents unchanged.
 * @param {string[]} fieldNames - List of field names to replace with translated values
 * @returns {Promise<Object|Object[]>} Same shape as input, with translated fields merged in
 */
async function applyTranslations(documents, modelName, locale, fieldNames) {
  if (!locale || locale === 'en' || !fieldNames || fieldNames.length === 0) {
    return documents;
  }

  const isArray = Array.isArray(documents);
  const list = isArray ? documents : [documents];
  if (list.length === 0) return documents;

  const ids = list.map((doc) => doc._id).filter(Boolean);
  if (ids.length === 0) return documents;

  const translations = await Translation.find({
    model: modelName,
    documentId: { $in: ids },
    locale,
  }).lean();

  const mapByDoc = {};
  for (const tr of translations) {
    const id = tr.documentId.toString();
    if (!mapByDoc[id]) mapByDoc[id] = {};
    if (tr.fields && typeof tr.fields === 'object') {
      const fieldsObj = tr.fields instanceof Map ? Object.fromEntries(tr.fields) : tr.fields;
      for (const key of fieldNames) {
        if (fieldsObj[key] != null) mapByDoc[id][key] = fieldsObj[key];
      }
    }
  }

  for (let i = 0; i < list.length; i++) {
    let doc = list[i];
    const id = doc._id && doc._id.toString();
    const tr = mapByDoc[id];
    if (!tr) continue;
    if (typeof doc.toObject === 'function') {
      doc = doc.toObject();
      list[i] = doc;
    }
    deepMerge(doc, tr);
  }

  return isArray ? list : list[0];
}

module.exports = { applyTranslations };
