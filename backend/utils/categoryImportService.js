// backend/utils/categoryImportService.js
const XLSX = require("xlsx");
const Category = require("../models/Category");
const Subcategory = require("../models/Subcategory");
const ChildCategory = require("../models/ChildCategory");
const { resolvePublicUrl, toR2DeleteKey } = require("./mediaUrlUtils");
const { CATEGORY_CONTRACT_VERSION } = require("./categoryExportService");
const { normalizeTaxonomyDescriptionForStorage } = require("./taxonomyDescriptionFormat");
const {
  isCatalogueCategoryFormatRows,
  normalizeCatalogueCategoryImportRows,
} = require("./categoryCatalogueContract");

const VALID_LEVELS = new Set(["category", "subcategory", "childCategory"]);
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg)$/i;

/** Obsolete taxonomy shipping columns — ignored on import (no slab at taxonomy level). */
const OBSOLETE_TAXONOMY_SHIPPING_COLUMNS = [
  "defaultShippingApplicability",
  "defaultShippingType",
  "defaultShippingVisibility",
];

function parseCsvBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return normalizeCatalogueCategoryImportRows(rows);
}

function rowsWithLineNumbers(buffer) {
  return parseCsvBuffer(buffer).map((row, index) => ({
    ...row,
    _rowNum: index + 2,
  }));
}

function parseFaq(value) {
  if (!value || value === "[]") return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeLevel(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "child" || v === "childcategory" || v === "child-category") return "childCategory";
  if (v === "sub" || v === "subcategory" || v === "sub-category") return "subcategory";
  if (v === "cat" || v === "category" || v === "main") return "category";
  return v;
}

/**
 * Normalize exported/imported image values to stored taxonomy image format.
 * Accepts full URLs, uploads/categories paths, or bare filenames (same as CRUD upload storage).
 */
function normalizeImportedCategoryImage(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const key = toR2DeleteKey(trimmed);
    if (!key || !IMAGE_EXT.test(key)) return undefined;
    if (key.startsWith("uploads/categories/")) {
      return key.slice("uploads/categories/".length);
    }
    if (key.startsWith("uploads/")) {
      const rest = key.slice("uploads/".length);
      if (!rest.includes("/")) return rest;
    }
    return key;
  }

  let stored = trimmed.replace(/^\/+/, "");
  if (stored.startsWith("uploads/categories/")) {
    stored = stored.slice("uploads/categories/".length);
  } else if (stored.startsWith("uploads/")) {
    stored = stored.slice("uploads/".length);
  }

  if (IMAGE_EXT.test(stored)) return stored;
  return undefined;
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

function applyImageToPayload(payload, row) {
  const image = normalizeImportedCategoryImage(row.image);
  if (image) {
    payload.image = image;
  }
}

function stripObsoleteTaxonomyShippingColumns(row) {
  const cleaned = { ...row };
  OBSOLETE_TAXONOMY_SHIPPING_COLUMNS.forEach((key) => {
    delete cleaned[key];
  });
  return cleaned;
}

function normalizeImportedDescription(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return undefined;
  }
  return normalizeTaxonomyDescriptionForStorage(String(value));
}

function buildCategoryPayload(row) {
  const payload = {
    name: String(row.name).trim(),
    title: row.title || undefined,
    description: normalizeImportedDescription(row.description),
    faq: parseFaq(row.faq),
    taxRate: optionalNumber(row.taxRate),
    taxType: row.taxType || "GST",
    commissionRate: optionalNumber(row.commissionRate),
    commissionType: row.commissionType || undefined,
    showInMegaMenu: String(row.showInMegaMenu).toUpperCase() === "TRUE",
    megaMenuOrder: optionalNumber(row.megaMenuOrder) ?? 0,
    sortOrder: optionalNumber(row.sortOrder) ?? 0,
  };
  applyImageToPayload(payload, row);
  return payload;
}

function buildSubcategoryPayload(row, parentId) {
  const payload = {
    name: String(row.name).trim(),
    category: parentId,
    title: row.title || undefined,
    description: normalizeImportedDescription(row.description),
    faq: parseFaq(row.faq),
    taxRate: optionalNumber(row.taxRate),
    taxType: row.taxType || "GST",
  };
  applyImageToPayload(payload, row);
  return payload;
}

function buildChildPayload(row, parentSubId) {
  const payload = {
    name: String(row.name).trim(),
    subcategory: parentSubId,
    title: row.title || undefined,
    description: normalizeImportedDescription(row.description),
    faq: parseFaq(row.faq),
    taxRate: optionalNumber(row.taxRate),
    taxType: row.taxType || "GST",
  };
  applyImageToPayload(payload, row);
  return payload;
}

async function lookupCategoryByRef(ref) {
  if (!ref) return null;
  const trimmed = String(ref).trim();
  let found = await Category.findOne({ slug: trimmed }).lean();
  if (found) return found;
  found = await Category.findOne({ name: new RegExp(`^${trimmed}$`, "i") }).lean();
  return found;
}

async function lookupSubcategoryByRef(ref, categoryId) {
  if (!ref) return null;
  const trimmed = String(ref).trim();
  const filter = categoryId ? { category: categoryId } : {};
  let found = await Subcategory.findOne({ ...filter, slug: trimmed }).lean();
  if (found) return found;
  found = await Subcategory.findOne({ ...filter, name: new RegExp(`^${trimmed}$`, "i") }).lean();
  return found;
}

function validateRow(row, rowIndex, options = {}) {
  const errors = [];
  const rowNum = rowIndex + 2;
  const level = normalizeLevel(row.level);

  if (!VALID_LEVELS.has(level)) {
    errors.push({ row: rowNum, message: `Invalid level "${row.level}" — use category, subcategory, or childCategory` });
    return { errors, level: null };
  }

  if (!row.name || !String(row.name).trim()) {
    errors.push({ row: rowNum, message: "name is required" });
  }

  if (level === "subcategory" && !row.parentCategory) {
    errors.push({ row: rowNum, message: "parentCategory is required for subcategory rows" });
  }

  if (level === "childCategory") {
    if (!row.parentCategory) {
      errors.push({ row: rowNum, message: "parentCategory is required for childCategory rows" });
    }
    if (!row.parentSubcategory) {
      errors.push({ row: rowNum, message: "parentSubcategory is required for childCategory rows" });
    }
  }

  if (row.image && String(row.image).trim() && !normalizeImportedCategoryImage(row.image)) {
    errors.push({ row: rowNum, message: "image must be a valid image URL or filename (jpg, png, gif, webp, svg)" });
  }

  // P6: defaultShipping* columns are ignored if present (no taxonomy shipping slab)
  return { errors, level, warnings: [] };
}

async function classifyCategoryActions(rows) {
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const level = normalizeLevel(row.level);
    const name = String(row.name || "").trim();
    const slug = String(row.slug || "").trim();
    if (!VALID_LEVELS.has(level) || !name) continue;

    let existing = null;
    if (level === "category") {
      existing = slug
        ? await Category.findOne({ slug }).lean()
        : await Category.findOne({ name: new RegExp(`^${name}$`, "i") }).lean();
    } else if (level === "subcategory") {
      const parent = await lookupCategoryByRef(row.parentCategory);
      if (!parent) continue;
      const filter = { category: parent._id };
      existing = slug
        ? await Subcategory.findOne({ ...filter, slug }).lean()
        : await Subcategory.findOne({ ...filter, name: new RegExp(`^${name}$`, "i") }).lean();
    } else if (level === "childCategory") {
      const parentCat = await lookupCategoryByRef(row.parentCategory);
      const parentSub = parentCat
        ? await lookupSubcategoryByRef(row.parentSubcategory, parentCat._id)
        : null;
      if (!parentSub) continue;
      const filter = { subcategory: parentSub._id };
      existing = slug
        ? await ChildCategory.findOne({ ...filter, slug }).lean()
        : await ChildCategory.findOne({ ...filter, name: new RegExp(`^${name}$`, "i") }).lean();
    }

    if (existing) updated += 1;
    else created += 1;
  }
  return { created, updated };
}

async function validateCategoryImport(buffer) {
  const rows = parseCsvBuffer(buffer);
  if (!rows.length) {
    return {
      valid: false,
      errors: [{ row: 0, message: "Empty import file" }],
      warnings: [],
      validRows: 0,
      totalRows: 0,
      newRecords: 0,
      updates: 0,
      skipped: 0,
    };
  }

  const catalogueFormat = isCatalogueCategoryFormatRows(rows);
  const errors = [];
  const warnings = [];
  for (let i = 0; i < rows.length; i++) {
    const cleaned = stripObsoleteTaxonomyShippingColumns(rows[i]);
    const { errors: rowErrors } = validateRow(cleaned, i, { catalogueFormat });
    errors.push(...rowErrors);
  }

  const invalidRowNums = new Set(errors.map((e) => e.row));
  const validRowObjects = rows.filter((_, index) => !invalidRowNums.has(index + 2));
  const actions = await classifyCategoryActions(validRowObjects);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validRows: rows.length - invalidRowNums.size,
    totalRows: rows.length,
    newRecords: actions.created,
    updates: actions.updated,
    skipped: 0,
  };
}

function formatDuplicateKeyError(err, level, row) {
  const keyValue = err.keyValue || {};
  const keys = Object.keys(keyValue);
  if (keys.length === 0) {
    return `Duplicate ${level} record for "${row.name}"`;
  }
  if (level === "category" && keys.includes("name")) {
    return `Duplicate category name "${keyValue.name}"`;
  }
  if (level === "category" && keys.includes("slug")) {
    return `Duplicate category slug "${keyValue.slug}"`;
  }
  if (level === "subcategory" && keys.includes("slug")) {
    return `Duplicate subcategory slug "${keyValue.slug}" under parent category`;
  }
  if (level === "childCategory" && keys.includes("slug")) {
    return `Duplicate child category slug "${keyValue.slug}" under parent subcategory`;
  }
  const parts = keys.map((k) => `${k} "${keyValue[k]}"`).join(", ");
  return `Duplicate ${level}: conflicting ${parts}`;
}

function mapSaveError(err, level, row, rowNum) {
  if (err.code === 11000) {
    return { row: rowNum, message: formatDuplicateKeyError(err, level, row) };
  }
  if (err.name === "ValidationError") {
    const first = Object.values(err.errors || {})[0];
    return { row: rowNum, message: first?.message || err.message };
  }
  return { row: rowNum, message: err.message || `Failed to import ${level}` };
}

async function importCategoryRow(row) {
  const rowNum = row._rowNum;
  const level = normalizeLevel(row.level);

  if (level === "category") {
    const existing = row.slug
      ? await Category.findOne({ slug: String(row.slug).trim() })
      : await Category.findOne({ name: new RegExp(`^${String(row.name).trim()}$`, "i") });

    const payload = buildCategoryPayload(row);

    try {
      if (existing) {
        Object.assign(existing, payload);
        await existing.save();
      } else {
        await new Category(payload).save();
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mapSaveError(err, "category", row, rowNum) };
    }
  }

  if (level === "subcategory") {
    const parent = await lookupCategoryByRef(row.parentCategory);
    if (!parent) {
      return {
        ok: false,
        error: { row: rowNum, message: `Parent category not found: ${row.parentCategory}` },
      };
    }

    const filter = { category: parent._id };
    const existing = row.slug
      ? await Subcategory.findOne({ ...filter, slug: String(row.slug).trim() })
      : await Subcategory.findOne({ ...filter, name: new RegExp(`^${String(row.name).trim()}$`, "i") });

    const payload = buildSubcategoryPayload(row, parent._id);

    try {
      if (existing) {
        Object.assign(existing, payload);
        await existing.save();
      } else {
        await new Subcategory(payload).save();
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mapSaveError(err, "subcategory", row, rowNum) };
    }
  }

  if (level === "childCategory") {
    const parentCat = await lookupCategoryByRef(row.parentCategory);
    if (!parentCat) {
      return {
        ok: false,
        error: { row: rowNum, message: `Parent category not found: ${row.parentCategory}` },
      };
    }

    const parentSub = await lookupSubcategoryByRef(row.parentSubcategory, parentCat._id);
    if (!parentSub) {
      return {
        ok: false,
        error: { row: rowNum, message: `Parent subcategory not found: ${row.parentSubcategory}` },
      };
    }

    const filter = { subcategory: parentSub._id };
    const existing = row.slug
      ? await ChildCategory.findOne({ ...filter, slug: String(row.slug).trim() })
      : await ChildCategory.findOne({ ...filter, name: new RegExp(`^${String(row.name).trim()}$`, "i") });

    const payload = buildChildPayload(row, parentSub._id);

    try {
      if (existing) {
        Object.assign(existing, payload);
        await existing.save();
      } else {
        await new ChildCategory(payload).save();
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mapSaveError(err, "childCategory", row, rowNum) };
    }
  }

  return { ok: false, error: { row: rowNum, message: `Unsupported level "${row.level}"` } };
}

async function importCategoryRows(buffer) {
  const rows = rowsWithLineNumbers(buffer);
  if (!rows.length) {
    const err = new Error("Empty import file");
    err.code = "EMPTY_FILE";
    throw err;
  }

  const validation = await validateCategoryImport(buffer);
  if (!validation.valid) {
    const err = new Error("Validation failed");
    err.code = "VALIDATION_FAILED";
    err.errors = validation.errors;
    throw err;
  }

  const categories = rows.filter((r) => normalizeLevel(r.level) === "category");
  const subcategories = rows.filter((r) => normalizeLevel(r.level) === "subcategory");
  const children = rows.filter((r) => normalizeLevel(r.level) === "childCategory");

  const errors = [];
  let imported = 0;

  for (const row of [...categories, ...subcategories, ...children]) {
    const result = await importCategoryRow(row);
    if (result.ok) {
      imported++;
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  return {
    imported,
    failed: errors.length,
    errors,
    warnings: validation.warnings || [],
    totalRows: rows.length,
  };
}

module.exports = {
  CATEGORY_CONTRACT_VERSION,
  parseCsvBuffer,
  rowsWithLineNumbers,
  normalizeImportedCategoryImage,
  validateCategoryImport,
  importCategoryRows,
};
