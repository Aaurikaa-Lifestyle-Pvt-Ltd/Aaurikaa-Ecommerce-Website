// backend/utils/categoryCatalogueContract.js
// AAURIKAA operator-facing Category CSV — exactly 8 locked fields.

const mongoose = require('mongoose');
const { baseSlug } = require('./slugUtils');
const { resolvePublicUrl } = require('./mediaUrlUtils');

/** Locked column order for operator category CSV/XLSX. */
const CATEGORY_CATALOGUE_COLUMNS = [
  'level',
  'name',
  'slug',
  'parentCategory',
  'parentSubcategory',
  'image',
  'taxRate',
  'taxType',
];

const CATEGORY_CATALOGUE_REQUIRED = new Set(['level', 'name']);

function castToString(val) {
  return val === null || val === undefined ? '' : String(val);
}

function isObjectIdString(value) {
  return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value.trim());
}

/** Normalize Category/Subcategory refs to a stable map key — never use raw Object.toString(). */
function refToIdKey(ref) {
  if (ref === null || ref === undefined || ref === '') return '';
  if (ref instanceof mongoose.Types.ObjectId) return ref.toString();
  if (typeof ref === 'object') {
    if (ref.$oid) return String(ref.$oid).trim();
    if (ref._id !== null && ref._id !== undefined && ref._id !== ref) {
      return refToIdKey(ref._id);
    }
  }
  const str = String(ref).trim();
  if (str === '[object Object]') return '';
  if (mongoose.Types.ObjectId.isValid(str)) {
    return new mongoose.Types.ObjectId(str).toString();
  }
  return str;
}

/** Operator-facing parent cells: display name preferred (slug remains accepted on import). */
function taxonomyDisplayName(entity) {
  if (!entity || typeof entity !== 'object') return '';
  return castToString(entity.name || entity.slug).trim();
}

function indexTaxonomyById(entities) {
  const map = new Map();
  for (const entity of entities || []) {
    const key = refToIdKey(entity?._id);
    if (key) map.set(key, entity);
  }
  return map;
}

function resolveCategoryParentRef(categoryRef, catById) {
  if (categoryRef === null || categoryRef === undefined || categoryRef === '') return '';

  if (isPopulatedTaxonomyRef(categoryRef)) {
    return taxonomyDisplayName(categoryRef);
  }

  const key = refToIdKey(categoryRef);
  const parent = key ? catById.get(key) : null;
  if (parent) return taxonomyDisplayName(parent);

  const raw = castToString(categoryRef).trim();
  if (isObjectIdString(raw) || isObjectIdString(key)) return '';
  return raw;
}

function isPopulatedTaxonomyRef(ref) {
  return (
    typeof ref === 'object' &&
    ref !== null &&
    (Boolean(ref.name) || Boolean(ref.slug))
  );
}

function resolveParentSubcategoryDoc(child, subById) {
  if (isPopulatedTaxonomyRef(child.subcategory)) return child.subcategory;
  return subById.get(refToIdKey(child.subcategory)) || null;
}

function resolveSubcategoryParentRef(subcategoryRef, subById) {
  if (subcategoryRef === null || subcategoryRef === undefined || subcategoryRef === '') return '';

  if (isPopulatedTaxonomyRef(subcategoryRef)) {
    return taxonomyDisplayName(subcategoryRef);
  }

  const key = refToIdKey(subcategoryRef);
  const parent = key ? subById.get(key) : null;
  if (parent) return taxonomyDisplayName(parent);

  const raw = castToString(subcategoryRef).trim();
  if (isObjectIdString(raw) || isObjectIdString(key)) return '';
  return raw;
}

function normalizeNum(val) {
  if (val === null || val === undefined || val === '' || Number.isNaN(Number(val))) return '';
  return Number(val);
}

function serializeImage(image) {
  if (!image) return '';
  return resolvePublicUrl(image) || image;
}

function buildCatalogueCategoryRow({
  level,
  name,
  slug,
  parentCategory = '',
  parentSubcategory = '',
  image = '',
  taxRate,
  taxType = 'GST',
}) {
  const row = {
    level,
    name: name || '',
    slug: castToString(slug),
    parentCategory: castToString(parentCategory),
    parentSubcategory: castToString(parentSubcategory),
    image: serializeImage(image),
    taxRate: normalizeNum(taxRate),
    taxType: castToString(taxType || 'GST'),
  };

  Object.keys(row).forEach((key) => {
    const val = row[key];
    if (val === null || val === undefined || (typeof val === 'number' && Number.isNaN(val))) {
      row[key] = '';
    }
  });

  return row;
}

/**
 * Operator export rows — level-batched (categories, subcategories, children).
 */
function buildCatalogueCategoryExportRows(categories, subcategories, childCategories) {
  const rows = [];
  const catById = indexTaxonomyById(categories);
  const subById = indexTaxonomyById(subcategories);

  for (const cat of categories || []) {
    rows.push(
      buildCatalogueCategoryRow({
        level: 'category',
        name: cat.name,
        slug: cat.slug,
        image: cat.image,
        taxRate: cat.taxRate,
        taxType: cat.taxType,
      })
    );
  }

  for (const sub of subcategories || []) {
    rows.push(
      buildCatalogueCategoryRow({
        level: 'subcategory',
        name: sub.name,
        slug: sub.slug,
        parentCategory: resolveCategoryParentRef(sub.category, catById),
        image: sub.image,
        taxRate: sub.taxRate,
        taxType: sub.taxType,
      })
    );
  }

  for (const child of childCategories || []) {
    const parentSub = resolveParentSubcategoryDoc(child, subById);
    rows.push(
      buildCatalogueCategoryRow({
        level: 'childCategory',
        name: child.name,
        slug: child.slug,
        parentCategory: parentSub ? resolveCategoryParentRef(parentSub.category, catById) : '',
        parentSubcategory: resolveSubcategoryParentRef(child.subcategory, subById),
        image: child.image,
        taxRate: child.taxRate,
        taxType: child.taxType,
      })
    );
  }

  return rows;
}

function pickCatalogueCategoryFields(row) {
  const ordered = {};
  for (const key of CATEGORY_CATALOGUE_COLUMNS) {
    ordered[key] = row[key] ?? '';
  }
  return ordered;
}

function isCatalogueCategoryFormatRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.contractVersion !== undefined && String(row.contractVersion).trim() !== '') {
    return false;
  }
  const technicalOnly = ['title', 'description', 'faq', 'commissionRate', 'showInMegaMenu', 'sortOrder'];
  if (technicalOnly.some((col) => row[col] !== undefined && String(row[col]).trim() !== '')) {
    return false;
  }
  return row.level !== undefined && String(row.level).trim() !== '';
}

function isCatalogueCategoryFormatRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  return rows.every(isCatalogueCategoryFormatRow);
}

function deriveTaxonomySlugFromName(name) {
  return baseSlug(name);
}

function normalizeCatalogueCategoryImportRow(row) {
  if (!row || typeof row !== 'object') return row;
  if (!isCatalogueCategoryFormatRow(row)) return { ...row };

  const out = {};
  for (const key of CATEGORY_CATALOGUE_COLUMNS) {
    if (row[key] !== undefined) out[key] = row[key];
  }

  const name = castToString(out.name).trim();
  const slug = castToString(out.slug).trim();
  if (name && !slug) {
    out.slug = deriveTaxonomySlugFromName(name);
  }

  return out;
}

function normalizeCatalogueCategoryImportRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeCatalogueCategoryImportRow);
}

module.exports = {
  CATEGORY_CATALOGUE_COLUMNS,
  CATEGORY_CATALOGUE_REQUIRED,
  buildCatalogueCategoryRow,
  buildCatalogueCategoryExportRows,
  pickCatalogueCategoryFields,
  isCatalogueCategoryFormatRow,
  isCatalogueCategoryFormatRows,
  deriveTaxonomySlugFromName,
  normalizeCatalogueCategoryImportRow,
  normalizeCatalogueCategoryImportRows,
  refToIdKey,
  indexTaxonomyById,
  resolveCategoryParentRef,
  resolveSubcategoryParentRef,
  resolveParentSubcategoryDoc,
};
