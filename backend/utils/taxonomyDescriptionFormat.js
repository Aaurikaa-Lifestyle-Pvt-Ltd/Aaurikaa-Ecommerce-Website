/**
 * Taxonomy description format conversion (HTML / plain / TipTap JSON).
 * Backend-native TipTap stack — no frontend CLI dependency.
 */
const { validateStructuredContent, isStructuredContent } = require('./contentGovernance');
const { sanitizeRichTextForSubmission } = require('./richText/richTextSanitizeUtils');
const {
  hasHtmlTags,
  htmlToTiptapDoc,
  tiptapDocToHtml,
  plainTextToTiptapDoc,
  resetTaxonomyRichTextEngineForTests,
} = require('./richText/taxonomyRichTextEngine');

function normalizeTaxonomyDescriptionForStorage(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined;
  }

  const str = String(value).trim();
  let normalized;

  if (isStructuredContent(str)) {
    normalized = sanitizeRichTextForSubmission(str);
  } else if (hasHtmlTags(str)) {
    normalized = sanitizeRichTextForSubmission(htmlToTiptapDoc(str));
  } else {
    normalized = sanitizeRichTextForSubmission(plainTextToTiptapDoc(str));
  }

  if (!normalized) return undefined;

  const parsed = JSON.parse(normalized);
  const validation = validateStructuredContent(parsed, 'CMS');
  if (!validation.isValid) {
    const err = new Error(`Invalid taxonomy description: ${validation.errors.join('; ')}`);
    err.code = 'INVALID_TAXONOMY_DESCRIPTION';
    throw err;
  }

  return normalized;
}

function formatTaxonomyDescriptionForExport(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return '';
  }

  const str = String(value).trim();
  if (!str) return '';

  if (isStructuredContent(str)) {
    return tiptapDocToHtml(str);
  }

  return str;
}

module.exports = {
  isStructuredContent,
  normalizeTaxonomyDescriptionForStorage,
  formatTaxonomyDescriptionForExport,
  resetTaxonomyRichTextEngineForTests,
};
