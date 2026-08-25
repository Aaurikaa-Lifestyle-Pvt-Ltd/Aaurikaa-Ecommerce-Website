/**
 * Content Governance for Rich Text JSON.
 * Supports Tiptap doc JSON ({ type:'doc', content:[] })
 * and legacy blocks JSON ({ blocks: [] }) for migration compatibility.
 */

const BLOCK_TYPES = {
  HEADING: 'heading',
  PARAGRAPH: 'paragraph',
  IMAGE: 'image',
  BUTTON: 'button',
  TABLE: 'table',
  SECTION: 'section',
  MEDIA_TEXT: 'mediaText'
};

const GOVERNANCE_RULES = {
  HEADING: {
    MIN_LEVEL: 1,
    MAX_LEVEL: 6,
  },
  IMAGE: {
    REQUIRE_ALT: false,
  },
};

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const isTiptapDoc = (data) => isObject(data) && data.type === 'doc' && Array.isArray(data.content);
const isLegacyBlocksDoc = (data) => isObject(data) && Array.isArray(data.blocks);

const hasDisallowedProtocol = (href = '') => {
  if (!href) return false;
  if (href.startsWith('/') || href.startsWith('#')) return false;
  try {
    const protocol = new URL(href).protocol.toLowerCase();
    return !['http:', 'https:', 'mailto:', 'tel:'].includes(protocol);
  } catch {
    return true;
  }
};

const validateTiptapDoc = (data, context = 'DEFAULT') => {
  const errors = [];
  const isProduct = String(context).toUpperCase() === 'PRODUCT';

  let lastHeadingLevel = 0;

  const walk = (node, path = 'doc') => {
    if (!node || typeof node !== 'object') {
      errors.push(`${path}: invalid node`);
      return;
    }

    if (node.type === 'heading') {
      const level = Number(node.attrs?.level || 0);
      if (level < 1 || level > 6) {
        errors.push(`${path}: heading level must be 1..6`);
      }
      if (isProduct && (level < 2 || level > 4)) {
        errors.push(`${path}: product heading level must be H2..H4`);
      }
      if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
        errors.push(`${path}: invalid heading hierarchy H${lastHeadingLevel} -> H${level}`);
      }
      if (level >= 1 && level <= 6) lastHeadingLevel = level;
    }

    if (node.type === 'image') {
      const src = String(node.attrs?.src || '').trim();
      const alt = String(node.attrs?.alt || '').trim();
      if (!src) errors.push(`${path}: image src required`);
      if (GOVERNANCE_RULES.IMAGE.REQUIRE_ALT && !alt) errors.push(`${path}: image alt required`);
      if (src && hasDisallowedProtocol(src)) errors.push(`${path}: image src protocol not allowed`);
    }

    if (node.type === 'cta') {
      const text = String(node.attrs?.text || '').trim();
      const href = String(node.attrs?.href || '').trim();
      if (!text) errors.push(`${path}: cta text required`);
      if (!href) errors.push(`${path}: cta href required`);
      if (href && hasDisallowedProtocol(href)) errors.push(`${path}: cta href protocol not allowed`);
    }

    if (node.type === 'ctaButton') {
      const text = String(node.attrs?.text || '').trim();
      const url = String(node.attrs?.url || '').trim();
      if (!text) errors.push(`${path}: ctaButton text required`);
      if (!url) errors.push(`${path}: ctaButton url required`);
      if (url && hasDisallowedProtocol(url)) errors.push(`${path}: ctaButton url protocol not allowed`);
    }

    if (Array.isArray(node.marks)) {
      node.marks.forEach((mark, idx) => {
        if (mark?.type === 'link') {
          const href = String(mark.attrs?.href || '').trim();
          if (!href) errors.push(`${path}.marks[${idx}]: link href required`);
          if (href && hasDisallowedProtocol(href)) errors.push(`${path}.marks[${idx}]: link protocol not allowed`);
        }
      });
    }

    if (Array.isArray(node.content)) {
      node.content.forEach((child, i) => walk(child, `${path}.content[${i}]`));
    }
  };

  data.content.forEach((n, i) => walk(n, `doc.content[${i}]`));

  return { isValid: errors.length === 0, errors };
};

// Keep legacy validator permissive (for migration/backward compatibility)
const validateLegacyBlocks = (data) => {
  if (!Array.isArray(data.blocks)) {
    return { isValid: false, errors: ['Invalid legacy format: blocks array missing'] };
  }
  return { isValid: true, errors: [] };
};

const validateStructuredContent = (data, context = 'DEFAULT') => {
  if (isTiptapDoc(data)) return validateTiptapDoc(data, context);
  if (isLegacyBlocksDoc(data)) return validateLegacyBlocks(data, context);
  return { isValid: false, errors: ['Invalid structured content format'] };
};

const isStructuredContent = (content) => {
  if (typeof content !== 'string') return false;
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return isTiptapDoc(parsed) || isLegacyBlocksDoc(parsed);
  } catch (e) {
    return false;
  }
};

module.exports = {
  BLOCK_TYPES,
  GOVERNANCE_RULES,
  validateStructuredContent,
  isStructuredContent
};
