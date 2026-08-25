/**
 * Server-side rich-text sanitization helpers (subset of frontend/utils/richTextUtils.js).
 * Keep in sync when CMS sanitization rules change.
 */

const EMPTY_TIPTAP_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const SAFE_HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function sanitizeHref(href = '') {
  const value = String(href || '').trim();
  if (!value) return '';
  if (value.startsWith('/')) return value;
  if (value.startsWith('#')) return value;
  try {
    const u = new URL(value);
    const p = u.protocol.toLowerCase();
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(p)) return value;
    return '';
  } catch {
    return '';
  }
}

function sanitizeColor(hex = '') {
  const v = String(hex || '').trim();
  if (!v) return null;
  if (SAFE_HEX.test(v)) return v;
  return null;
}

function sanitizeHighlightColor(hex = '') {
  const v = String(hex || '').trim();
  if (!v) return null;
  if (SAFE_HEX.test(v)) return v;
  return null;
}

function safeJsonParse(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isTiptapDoc(data) {
  return !!data && data.type === 'doc' && Array.isArray(data.content);
}

function isLegacyStructuredDoc(data) {
  return !!data && Array.isArray(data.blocks);
}

function textNode(text, marks = []) {
  return { type: 'text', text: text || '', ...(marks.length ? { marks } : {}) };
}

function paragraphNode(text = '') {
  return { type: 'paragraph', content: [textNode(text)] };
}

function convertInlineContent(content) {
  if (typeof content === 'string') return [textNode(content)];
  if (!Array.isArray(content)) return [textNode('')];

  const out = [];
  content.forEach((node) => {
    if (!node) return;
    if (node.type === 'text') out.push(textNode(node.value || ''));
    if (node.type === 'link') {
      out.push(
        textNode(node.value || node.href || 'link', [
          { type: 'link', attrs: { href: node.href || '', target: node.linkType === 'external' ? '_blank' : null } },
        ])
      );
    }
  });

  return out.length ? out : [textNode('')];
}

function legacyTableToTiptap(rows = [], hasHeader = true) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return {
    type: 'table',
    content: rows.map((row, rowIndex) => ({
      type: 'tableRow',
      content: (row || []).map((cell) => ({
        type: hasHeader && rowIndex === 0 ? 'tableHeader' : 'tableCell',
        content: [paragraphNode(String(cell || ''))],
      })),
    })),
  };
}

function legacyBlocksToTiptapDoc(blocks = []) {
  const content = [];

  blocks.forEach((block) => {
    if (!block || !block.type) return;
    switch (block.type) {
      case 'heading':
        content.push({
          type: 'heading',
          attrs: { level: block.level || 2 },
          content: convertInlineContent(block.content),
        });
        break;
      case 'paragraph':
        content.push({ type: 'paragraph', content: convertInlineContent(block.content) });
        break;
      case 'image':
        content.push({
          type: 'image',
          attrs: {
            src: block.url || '',
            alt: block.alt || '',
            title: block.caption || '',
            align: block.alignment || 'center',
            size: block.size || 100,
          },
        });
        break;
      case 'button':
        content.push({
          type: 'cta',
          attrs: {
            text: block.text || '',
            href: block.link || '',
            linkType: block.linkType || 'internal',
            variant: block.variant || 'primary',
          },
        });
        break;
      case 'table': {
        const table = legacyTableToTiptap(block.rows, block.hasHeader);
        if (table) content.push(table);
        break;
      }
      case 'section':
        if (Array.isArray(block.blocks)) {
          const nested = legacyBlocksToTiptapDoc(block.blocks);
          if (Array.isArray(nested.content)) content.push(...nested.content);
        }
        break;
      case 'mediaText':
        if (block.media?.url) {
          content.push({
            type: 'image',
            attrs: {
              src: block.media.url,
              alt: block.media.alt || '',
              title: block.media.caption || '',
              align: block.mediaPosition === 'left' ? 'left' : 'right',
              size: block.mediaWidth || 50,
            },
          });
        }
        if (Array.isArray(block.textBlocks)) {
          block.textBlocks.forEach((tb) => {
            if (tb?.type === 'paragraph') {
              content.push({ type: 'paragraph', content: convertInlineContent(tb.content) });
            }
          });
        }
        break;
      default:
        break;
    }
  });

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function htmlToPlainText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTextFromJsonLikeString(str) {
  if (typeof str !== 'string' || str.trim().length === 0) return '';
  const s = str.trim();
  if (!s.startsWith('{') && !s.startsWith('[')) return '';
  const textRegex = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  const parts = [];
  let m;
  while ((m = textRegex.exec(s)) !== null) {
    const raw = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    if (raw.trim()) parts.push(raw);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function normalizeToTiptapDoc(content) {
  if (!content) return EMPTY_TIPTAP_DOC;
  const parsed = typeof content === 'string' ? safeJsonParse(content) : content;

  if (isTiptapDoc(parsed)) return parsed;
  if (isLegacyStructuredDoc(parsed)) return legacyBlocksToTiptapDoc(parsed.blocks);

  if (typeof content !== 'string') return EMPTY_TIPTAP_DOC;
  const jsonLikeText = extractTextFromJsonLikeString(content);
  if (jsonLikeText.length > 0) {
    return { type: 'doc', content: [{ type: 'paragraph', content: [textNode(jsonLikeText)] }] };
  }
  const fallbackText = htmlToPlainText(content);
  return { type: 'doc', content: [{ type: 'paragraph', content: [textNode(fallbackText)] }] };
}

function sanitizeRichTextNode(node) {
  if (!node || typeof node !== 'object') return null;

  const next = { ...node };

  if (Array.isArray(node.content)) {
    next.content = node.content.map(sanitizeRichTextNode).filter(Boolean);
  }

  if (node.type === 'image') {
    const attrs = { ...(node.attrs || {}) };
    const src = String(attrs.src || attrs.url || attrs.public_url || '').trim();

    if (!src) return null;

    attrs.src = src;
    attrs.alt = String(attrs.alt || 'Image').trim() || 'Image';
    next.attrs = attrs;
  }

  return next;
}

function sanitizeRichTextForSubmission(content) {
  const doc = normalizeToTiptapDoc(content);
  const sanitized = {
    ...doc,
    content: (doc.content || []).map(sanitizeRichTextNode).filter(Boolean),
  };

  if (!sanitized.content.length) {
    sanitized.content = [{ type: 'paragraph' }];
  }

  return JSON.stringify(sanitized);
}

/** Mirrors frontend/utils/richTextUtils.js extractPlainText. */
function extractPlainTextFromNode(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  if (!Array.isArray(node.content)) return '';
  return node.content.map(extractPlainTextFromNode).join(' ');
}

function extractPlainText(doc) {
  const normalized = normalizeToTiptapDoc(doc);
  return (normalized.content || [])
    .map(extractPlainTextFromNode)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  EMPTY_TIPTAP_DOC,
  sanitizeHref,
  sanitizeColor,
  sanitizeHighlightColor,
  safeJsonParse,
  isTiptapDoc,
  isLegacyStructuredDoc,
  legacyBlocksToTiptapDoc,
  normalizeToTiptapDoc,
  sanitizeRichTextForSubmission,
  extractPlainText,
};
