const { validateStructuredContent } = require('./contentGovernance');
const {
  validateStructuredZone,
  AAURIKAA_SECTION_TYPES,
  MAX,
  isBlankRichText,
} = require('./staticPageStructuredZones');
const { getManifestOrThrow, ZONE_TYPES, EMPTY_TIPTAP_DOC } = require('../config/staticPageManifests');
const { isAllowedPageKey, getRegistryEntry } = require('../config/staticPageRegistry');

const META_DESCRIPTION_MAX = 320;
const ALLOWED_STATUSES = ['draft', 'published', 'trashed'];
const EMPTY_RICH_TEXT = JSON.stringify(EMPTY_TIPTAP_DOC);

const parseRichText = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
};

const validateRichTextDoc = (parsed) => {
  const validation = validateStructuredContent(parsed, 'CMS');
  if (!validation.isValid) {
    return {
      ok: false,
      message: 'Rich text content validation failed',
      details: { errors: validation.errors },
    };
  }
  return { ok: true };
};

const richTextHelpers = { parseRichText, validateRichTextDoc };

const zonesMapToObject = (zones) => {
  if (!zones) return {};
  if (zones instanceof Map) return Object.fromEntries(zones);
  if (typeof zones === 'object') return { ...zones };
  return {};
};

const extractPlainTextFromDoc = (doc) => {
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content)) return '';
  const texts = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'text' && node.text) texts.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  doc.content.forEach(walk);
  return texts.join(' ').replace(/\s+/g, ' ').trim();
};

const normalizeStandaloneRichText = (value, zoneId) => {
  if (value == null || value === '' || isBlankRichText(value)) {
    return { ok: true, normalized: EMPTY_RICH_TEXT };
  }
  const parsed = parseRichText(value);
  if (!parsed) {
    return { ok: false, message: `Zone "${zoneId}" must be valid structured JSON` };
  }
  const validation = validateRichTextDoc(parsed);
  if (!validation.ok) {
    return {
      ok: false,
      message: `Zone "${zoneId}" content validation failed`,
      details: validation.details,
    };
  }
  const normalized =
    typeof value === 'string' ? value.trim() : JSON.stringify(parsed);
  return { ok: true, normalized };
};

const validateFaqListValue = (value, zoneId) => {
  if (!Array.isArray(value)) {
    return { ok: false, message: `Zone "${zoneId}" must be an array of FAQ items` };
  }
  const normalized = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, message: `Zone "${zoneId}" item ${i} is invalid` };
    }
    const category = String(item.category || '').trim();
    const q = String(item.q || '').trim();
    let a = String(item.a || '').trim();
    let aRichText;

    if (item.aRichText != null && String(item.aRichText).trim() !== '') {
      const parsed = parseRichText(item.aRichText);
      if (!parsed) {
        return { ok: false, message: `Zone "${zoneId}" item ${i} answer must be valid structured JSON` };
      }
      const validation = validateStructuredContent(parsed, 'CMS');
      if (!validation.isValid) {
        return {
          ok: false,
          message: `Zone "${zoneId}" item ${i} answer validation failed`,
          details: { errors: validation.errors },
        };
      }
      aRichText =
        typeof item.aRichText === 'string' ? item.aRichText.trim() : JSON.stringify(parsed);
      if (!a) {
        a = extractPlainTextFromDoc(parsed);
      }
    }

    if (!q || (!a && !aRichText)) {
      return { ok: false, message: `Zone "${zoneId}" items require question and answer` };
    }

    const entry = { category, q, a };
    if (aRichText) entry.aRichText = aRichText;
    normalized.push(entry);
  }
  return { ok: true, normalized };
};

const validateOrderedSectionItem = (item, index) => {
  if (!item || typeof item !== 'object') {
    return { ok: false, message: `orderedSections item ${index} is invalid` };
  }
  const type = String(item.type || '').trim();
  if (!type || !AAURIKAA_SECTION_TYPES.has(type)) {
    return {
      ok: false,
      message: `orderedSections item ${index} has unknown section type "${type}"`,
    };
  }

  const base = { type };
  if (item.id != null && String(item.id).trim()) {
    base.id = String(item.id).trim().slice(0, 80);
  }

  if (type === 'richText') {
    const heading = String(item.heading || item.title || '').trim().slice(0, MAX.heading);
    const bodyResult = normalizeStandaloneRichText(item.bodyRichText ?? item.body, `orderedSections[${index}]`);
    if (!bodyResult.ok) return bodyResult;
    if (!heading && (!bodyResult.normalized || isBlankRichText(bodyResult.normalized))) {
      return { ok: false, message: `orderedSections item ${index} richText requires content` };
    }
    return {
      ok: true,
      normalized: { ...base, heading, bodyRichText: bodyResult.normalized },
    };
  }

  if (type === 'faqList') {
    const list = item.items ?? item.faqItems ?? item.value;
    const faqResult = validateFaqListValue(list, `orderedSections[${index}]`);
    if (!faqResult.ok) return faqResult;
    return { ok: true, normalized: { ...base, items: faqResult.normalized } };
  }

  if (type === 'heroBanner' || type === 'image' || type === 'imageText' || type === 'cardGrid' ||
      type === 'cta' || type === 'ctaCard' || type === 'contactCard' || type === 'supportPanel') {
    const payload =
      type === 'cardGrid'
        ? (item.items ?? item.cards ?? item)
        : item;
    const structured = validateStructuredZone(type, payload, richTextHelpers);
    if (!structured.ok) {
      return {
        ok: false,
        message: `orderedSections item ${index}: ${structured.message}`,
        details: structured.details,
      };
    }
    if (type === 'cardGrid') {
      return { ok: true, normalized: { ...base, items: structured.normalized } };
    }
    if (type === 'cta' || type === 'ctaCard') {
      return { ok: true, normalized: { ...base, type: 'ctaCard', ...structured.normalized } };
    }
    return { ok: true, normalized: { ...base, ...structured.normalized } };
  }

  return { ok: false, message: `orderedSections item ${index} unsupported type "${type}"` };
};

const validateOrderedSections = (value, zoneId) => {
  if (!Array.isArray(value)) {
    return { ok: false, message: `Zone "${zoneId}" must be an array of sections` };
  }
  if (value.length > MAX.orderedSections) {
    return {
      ok: false,
      message: `Zone "${zoneId}" allows at most ${MAX.orderedSections} sections`,
    };
  }
  const normalized = [];
  for (let i = 0; i < value.length; i += 1) {
    const result = validateOrderedSectionItem(value[i], i);
    if (!result.ok) return result;
    normalized.push(result.normalized);
  }
  return { ok: true, normalized };
};

const STRUCTURED_ZONE_TYPES = new Set([
  'contactCard',
  'ctaCard',
  'cta',
  'supportPanel',
  'noticeBanner',
  'linkCardList',
  'testimonialList',
  'videoTutorialList',
  'heroBanner',
  'image',
  'imageText',
  'cardGrid',
]);

const validateZoneValue = (zoneDef, value) => {
  const { id, type } = zoneDef;

  if (type === 'plainText') {
    if (value != null && typeof value !== 'string') {
      return { ok: false, message: `Zone "${id}" must be a string` };
    }
    return { ok: true, normalized: value == null ? '' : String(value) };
  }

  if (type === 'richText') {
    return normalizeStandaloneRichText(value, id);
  }

  if (type === 'sectionList') {
    if (!Array.isArray(value)) {
      return { ok: false, message: `Zone "${id}" must be an array of sections` };
    }
    const normalized = [];
    for (let i = 0; i < value.length; i += 1) {
      const item = value[i];
      if (!item || typeof item !== 'object') {
        return { ok: false, message: `Zone "${id}" item ${i} is invalid` };
      }
      const title = String(item.title || '').trim();
      const bodyParsed = parseRichText(item.bodyRichText);
      if (!title) {
        return { ok: false, message: `Zone "${id}" item ${i} requires a title` };
      }
      if (!bodyParsed) {
        return { ok: false, message: `Zone "${id}" item ${i} body must be valid structured JSON` };
      }
      const bodyValidation = validateStructuredContent(bodyParsed, 'CMS');
      if (!bodyValidation.isValid) {
        return {
          ok: false,
          message: `Zone "${id}" item ${i} body validation failed`,
          details: { errors: bodyValidation.errors },
        };
      }
      normalized.push({
        title,
        bodyRichText:
          typeof item.bodyRichText === 'string'
            ? item.bodyRichText.trim()
            : JSON.stringify(bodyParsed),
      });
    }
    return { ok: true, normalized };
  }

  if (type === 'orderedSections') {
    return validateOrderedSections(value, id);
  }

  if (STRUCTURED_ZONE_TYPES.has(type)) {
    const structured = validateStructuredZone(type, value, richTextHelpers);
    if (!structured.ok) return structured;
    const fixed = zoneDef.fixedItemCount;
    if (Number.isFinite(fixed) && fixed > 0) {
      const list = structured.normalized;
      if (!Array.isArray(list) || list.length !== fixed) {
        return {
          ok: false,
          message: `Zone "${id}" must contain exactly ${fixed} items (fixed page layout)`,
        };
      }
    }
    return structured;
  }

  if (type === 'faqList') {
    return validateFaqListValue(value, id);
  }

  if (!ZONE_TYPES.has(type)) {
    return { ok: false, message: `Unknown zone type "${type}"` };
  }

  return { ok: false, message: `Unsupported zone type "${type}"` };
};

const validateStaticPagePayload = ({ pageKey, status, seo, zones }) => {
  if (!isAllowedPageKey(pageKey)) {
    return { ok: false, message: 'pageKey is not in the static page registry' };
  }

  const registry = getRegistryEntry(pageKey);
  let manifest;
  try {
    manifest = getManifestOrThrow(pageKey);
  } catch {
    return {
      ok: false,
      message: 'This page is registered but has no content manifest yet (editor not enabled)',
    };
  }

  if (!ALLOWED_STATUSES.includes(status)) {
    return { ok: false, message: 'Invalid status', details: { allowed: ALLOWED_STATUSES } };
  }

  const seoTitle = seo?.title != null ? String(seo.title).trim() : '';
  const metaDescription =
    seo?.metaDescription != null ? String(seo.metaDescription).trim() : '';

  if (metaDescription.length > META_DESCRIPTION_MAX) {
    return {
      ok: false,
      message: `metaDescription must be at most ${META_DESCRIPTION_MAX} characters`,
    };
  }

  const inputZones = zonesMapToObject(zones);
  const normalizedZones = {};

  for (const zoneDef of manifest.zones) {
    const result = validateZoneValue(zoneDef, inputZones[zoneDef.id]);
    if (!result.ok) return result;
    normalizedZones[zoneDef.id] = result.normalized;
  }

  // Legacy/extra keys in the request are ignored (only manifest zones are persisted).

  return {
    ok: true,
    normalized: {
      pageKey,
      slug: registry.slug,
      status,
      seo: { title: seoTitle, metaDescription },
      zones: normalizedZones,
    },
  };
};

module.exports = {
  validateStaticPagePayload,
  validateZoneValue,
  validateOrderedSections,
  zonesMapToObject,
  META_DESCRIPTION_MAX,
};
