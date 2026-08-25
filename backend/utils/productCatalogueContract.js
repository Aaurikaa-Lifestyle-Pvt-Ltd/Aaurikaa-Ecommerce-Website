// backend/utils/productCatalogueContract.js
// AAURIKAA operator-facing Product CSV — exactly 20 locked fields.
// weightClass (shipping slab) is set in Admin Product UI, not this spreadsheet.
// Full technical export remains in productExportService (profile=full).

const { resolvePublicUrl } = require('./mediaUrlUtils');
const { CONTRACT_VERSION } = require('./productImportExport/constants');
const {
  extractPlainText,
  safeJsonParse,
  isTiptapDoc,
  isLegacyStructuredDoc,
} = require('./richText/richTextSanitizeUtils');

/** Locked column order for operator catalogue CSV/XLSX. */
const CATALOGUE_CSV_COLUMNS = [
  'productName',
  'sku',
  'category',
  'subcategory',
  'childCategory',
  'listPrice',
  'salePrice',
  'stock',
  'weight',
  'hsnCode',
  'taxRate',
  'taxIncluded',
  'mainImage',
  'galleryImages',
  'video',
  'description',
  'care',
  'manufacturerDetails',
  'keyFeatures',
  'faq',
];

/** Catalogue CSV column → internal import/export field. */
const CATALOGUE_TO_INTERNAL = {
  productName: 'name',
  listPrice: 'regularPrice',
  description: 'longDesc',
  care: 'usageSafetyContent',
  keyFeatures: 'features',
  faq: 'qandas',
};

/** Internal field → catalogue CSV column (unique inverse). */
const INTERNAL_TO_CATALOGUE = Object.fromEntries(
  Object.entries(CATALOGUE_TO_INTERNAL).map(([catalogue, internal]) => [internal, catalogue])
);

const CATALOGUE_REQUIRED = new Set([
  'productName',
  'listPrice',
  'stock',
  'category',
]);

const LIST_DELIMITER = ' | ';
const FAQ_ENTRY_DELIMITER = ' ;; ';

function castToString(val) {
  return val === null || val === undefined ? '' : String(val);
}

function normalizeBool(val) {
  return val === true ? 'TRUE' : 'FALSE';
}

function normalizeNum(val) {
  if (val === null || val === undefined || val === '' || Number.isNaN(Number(val))) return '';
  return Number(val);
}

function normalizeJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[]') return [];
    const parsed = safeJsonParse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
}

/**
 * Operator CSV text — never emit raw TipTap / legacy JSON blobs.
 */
function serializeCatalogueTextField(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' && value.trim() === '') return '';

  const plain = extractPlainText(value);
  if (plain) return plain;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const parsed = safeJsonParse(trimmed);
      if (parsed && (isTiptapDoc(parsed) || isLegacyStructuredDoc(parsed))) {
        return '';
      }
    }
    return trimmed;
  }

  return '';
}

function splitList(value) {
  if (!value || typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.includes(LIST_DELIMITER)) {
    return trimmed.split(LIST_DELIMITER).map((item) => item.trim()).filter(Boolean);
  }
  if (trimmed.includes('|')) {
    return trimmed.split('|').map((item) => item.trim()).filter(Boolean);
  }
  return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
}

function serializeGalleryImages(galleryImages) {
  const urls = Array.isArray(galleryImages)
    ? galleryImages.map((img) => resolvePublicUrl(img) || img)
    : galleryImages
      ? [resolvePublicUrl(galleryImages) || galleryImages]
      : [];
  return urls.filter(Boolean).join(LIST_DELIMITER);
}

function serializeKeyFeatures(features) {
  const rows = normalizeJsonArray(features);
  if (!rows.length) return '';
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return '';
      const key = serializeCatalogueTextField(row.key).trim();
      const value = serializeCatalogueTextField(row.value ?? '').trim();
      if (!key) return '';
      if (value && value !== key) return `${key}: ${value}`;
      return key;
    })
    .filter(Boolean)
    .join(LIST_DELIMITER);
}

function serializeFaq(qandas) {
  const entries = normalizeJsonArray(qandas);
  if (!entries.length) return '';
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return '';
      const question = serializeCatalogueTextField(entry.question).trim();
      const answer = serializeCatalogueTextField(entry.answer).trim();
      if (!question && !answer) return '';
      return `${question}${LIST_DELIMITER}${answer}`;
    })
    .filter(Boolean)
    .join(FAQ_ENTRY_DELIMITER);
}

function parseKeyFeaturesInput(raw) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (Array.isArray(raw)) return raw;
  const text = String(raw).trim();
  if (!text) return undefined;
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      /* fall through to human format */
    }
  }
  return splitList(text).map((segment) => {
    const colonIdx = segment.indexOf(':');
    if (colonIdx > 0) {
      const key = segment.slice(0, colonIdx).trim();
      const value = segment.slice(colonIdx + 1).trim();
      if (key && value) return { key, value };
    }
    return { key: segment, value: segment };
  });
}

function parseFaqInput(raw) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (Array.isArray(raw)) return raw;
  const text = String(raw).trim();
  if (!text) return undefined;
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      /* fall through to human format */
    }
  }
  return text
    .split(FAQ_ENTRY_DELIMITER)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const pipeIdx = entry.indexOf(LIST_DELIMITER);
      if (pipeIdx >= 0) {
        return {
          question: entry.slice(0, pipeIdx).trim(),
          answer: entry.slice(pipeIdx + LIST_DELIMITER.length).trim(),
        };
      }
      const altPipe = entry.indexOf('|');
      if (altPipe >= 0) {
        return {
          question: entry.slice(0, altPipe).trim(),
          answer: entry.slice(altPipe + 1).trim(),
        };
      }
      return { question: entry, answer: '' };
    })
    .filter((entry) => entry.question || entry.answer);
}

function isCatalogueFormatRow(row) {
  if (!row || typeof row !== 'object') return false;
  const catalogueOnlyColumns = [
    'productName',
    'listPrice',
    'description',
    'care',
    'keyFeatures',
    'faq',
  ];
  return catalogueOnlyColumns.some(
    (col) => row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== ''
  );
}

function isFullTechnicalFormatRow(row) {
  if (!row || typeof row !== 'object') return false;
  return (
    row.contractVersion !== undefined ||
    row.name !== undefined ||
    row.regularPrice !== undefined ||
    row.approvalStatus !== undefined ||
    row.variants !== undefined
  );
}

/**
 * Build one operator catalogue row from a populated product document.
 */
function buildCatalogueExportRow(product) {
  const p = product || {};
  const row = {
    productName: p.name || 'Untitled Product',
    sku: castToString(p.sku),
    category: castToString(p.category?.name || p.category?.slug),
    subcategory: castToString(p.subcategory?.name || p.subcategory?.slug),
    childCategory: castToString(p.childCategory?.name || p.childCategory?.slug),
    listPrice: normalizeNum(p.regularPrice),
    salePrice: normalizeNum(p.salePrice),
    stock: normalizeNum(p.stock),
    weight: normalizeNum(p.weight),
    hsnCode: castToString(p.hsnCode),
    taxRate: normalizeNum(p.taxRate),
    taxIncluded: normalizeBool(p.taxIncluded),
    mainImage: p.mainImage ? resolvePublicUrl(p.mainImage) || p.mainImage : '',
    galleryImages: serializeGalleryImages(p.galleryImages),
    video: p.video ? resolvePublicUrl(p.video) || p.video : '',
    description: serializeCatalogueTextField(p.longDesc),
    care: serializeCatalogueTextField(p.usageSafetyContent),
    manufacturerDetails: serializeCatalogueTextField(p.manufacturerConditions?.details),
    keyFeatures: serializeKeyFeatures(p.features),
    faq: serializeFaq(p.qandas),
  };

  Object.keys(row).forEach((key) => {
    const val = row[key];
    if (val === null || val === undefined || (typeof val === 'number' && Number.isNaN(val))) {
      row[key] = '';
    }
  });

  return row;
}

function buildCatalogueExportRows(products) {
  if (!Array.isArray(products)) return [];
  return products.map(buildCatalogueExportRow);
}

/**
 * Map AAURIKAA catalogue column names to internal import fields.
 * Preserves full technical columns when present (round-trip full export).
 */
function normalizeCatalogueImportRow(row) {
  if (!row || typeof row !== 'object') return row;

  const catalogueFormat = isCatalogueFormatRow(row);
  const technicalFormat = isFullTechnicalFormatRow(row);

  if (!catalogueFormat) return { ...row };

  const out = { ...row };

  for (const [catalogueCol, internalCol] of Object.entries(CATALOGUE_TO_INTERNAL)) {
    const catalogueVal = out[catalogueCol];
    const hasCatalogueVal =
      catalogueVal !== undefined && catalogueVal !== null && String(catalogueVal).trim() !== '';
    const internalVal = out[internalCol];
    const hasInternalVal =
      internalVal !== undefined && internalVal !== null && String(internalVal).trim() !== '';

    if (hasCatalogueVal && !hasInternalVal) {
      out[internalCol] = catalogueVal;
    }
    delete out[catalogueCol];
  }

  if (out.features !== undefined && typeof out.features === 'string') {
    out.features = parseKeyFeaturesInput(out.features);
  }

  if (out.qandas !== undefined && typeof out.qandas === 'string') {
    out.qandas = parseFaqInput(out.qandas);
  }

  if (!out.contractVersion && catalogueFormat && !technicalFormat) {
    out.contractVersion = CONTRACT_VERSION;
  }

  return out;
}

function normalizeCatalogueImportRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeCatalogueImportRow);
}

function pickCatalogueRowFields(row) {
  const ordered = {};
  for (const key of CATALOGUE_CSV_COLUMNS) {
    ordered[key] = row[key] ?? '';
  }
  return ordered;
}

module.exports = {
  CATALOGUE_CSV_COLUMNS,
  CATALOGUE_TO_INTERNAL,
  INTERNAL_TO_CATALOGUE,
  CATALOGUE_REQUIRED,
  LIST_DELIMITER,
  FAQ_ENTRY_DELIMITER,
  serializeCatalogueTextField,
  normalizeJsonArray,
  splitList,
  serializeGalleryImages,
  serializeKeyFeatures,
  serializeFaq,
  parseKeyFeaturesInput,
  parseFaqInput,
  isCatalogueFormatRow,
  isFullTechnicalFormatRow,
  buildCatalogueExportRow,
  buildCatalogueExportRows,
  normalizeCatalogueImportRow,
  normalizeCatalogueImportRows,
  pickCatalogueRowFields,
};
