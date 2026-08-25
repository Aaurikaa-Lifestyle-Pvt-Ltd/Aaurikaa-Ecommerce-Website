// backend/utils/categoryExportService.js
const XLSX = require("xlsx");
const { resolvePublicUrl } = require("./mediaUrlUtils");
const { formatTaxonomyDescriptionForExport } = require("./taxonomyDescriptionFormat");
const {
  CATEGORY_CATALOGUE_COLUMNS,
  buildCatalogueCategoryExportRows,
  pickCatalogueCategoryFields,
  indexTaxonomyById,
  resolveCategoryParentRef,
  resolveSubcategoryParentRef,
  resolveParentSubcategoryDoc,
  refToIdKey,
} = require("./categoryCatalogueContract");

const CATEGORY_CONTRACT_VERSION = "category-v1";

/**
 * Dual export notes:
 * - CSV (`formatCategoriesForExport`) is the canonical machine contract / import format
 *   (entity rows + level/parent columns; level-batched order).
 * - XLSX (`formatCategoriesForExportXlsx`) is presentation-only: a 3-column path sheet
 *   (Category | Subcategory | Child Category) in hierarchy order, English names, no fills.
 * - ExcelJS@4.4.0 (MIT) is used only for XLSX workbook output; SheetJS remains for CSV/import.
 * - XLSX is NOT an import format. Path-only rows cannot carry tax/SEO/commission fields.
 */

const PATH_HEADERS = ["Category", "Subcategory", "Child Category"];
const PATH_COLUMN_WIDTHS = { category: 28, subcategory: 28, childCategory: 28 };
const CATEGORY_CSV_COLUMNS = [
  "contractVersion",
  "level",
  "name",
  "slug",
  "parentCategory",
  "parentSubcategory",
  "title",
  "description",
  "faq",
  "image",
  "taxRate",
  "taxType",
  "commissionRate",
  "commissionType",
  "showInMegaMenu",
  "megaMenuOrder",
  "sortOrder",
];
const CATEGORY_MARKETPLACE_COLUMNS = ["commissionRate", "commissionType"];

function castToString(val) {
  return val === null || val === undefined ? "" : String(val);
}

function normalizeNum(val) {
  if (val === null || val === undefined || val === "" || Number.isNaN(Number(val))) return "";
  return Number(val);
}

function normalizeBool(val) {
  return val === true ? "TRUE" : "FALSE";
}

function serializeComplex(val) {
  if (!val || (Array.isArray(val) && val.length === 0)) return "[]";
  try {
    return JSON.stringify(val);
  } catch {
    return "[]";
  }
}

function compareByName(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
}

function displayName(entity) {
  return entity && entity.name ? String(entity.name) : "";
}

/**
 * Build flat CSV rows for all taxonomy levels with hierarchy columns.
 * Level-batched order (all categories, then all subcategories, then all children) is intentional
 * and must not change — production machine consumers and import round-trips rely on it.
 */
function formatCategoriesForExport(categories, subcategories, childCategories) {
  const rows = [];
  const catById = indexTaxonomyById(categories);
  const subById = indexTaxonomyById(subcategories);

  for (const cat of categories) {
    rows.push({
      contractVersion: CATEGORY_CONTRACT_VERSION,
      level: "category",
      name: cat.name || "",
      slug: castToString(cat.slug),
      parentCategory: "",
      parentSubcategory: "",
      title: castToString(cat.title),
      description: castToString(formatTaxonomyDescriptionForExport(cat.description)),
      faq: serializeComplex(cat.faq),
      image: cat.image ? resolvePublicUrl(cat.image) || cat.image : "",
      taxRate: normalizeNum(cat.taxRate),
      taxType: castToString(cat.taxType || "GST"),
      commissionRate: normalizeNum(cat.commissionRate),
      commissionType: castToString(cat.commissionType || "percentage"),
      showInMegaMenu: normalizeBool(cat.showInMegaMenu),
      megaMenuOrder: normalizeNum(cat.megaMenuOrder),
      sortOrder: normalizeNum(cat.sortOrder),
    });
  }

  for (const sub of subcategories) {
    rows.push({
      contractVersion: CATEGORY_CONTRACT_VERSION,
      level: "subcategory",
      name: sub.name || "",
      slug: castToString(sub.slug),
      parentCategory: resolveCategoryParentRef(sub.category, catById),
      parentSubcategory: "",
      title: castToString(sub.title),
      description: castToString(formatTaxonomyDescriptionForExport(sub.description)),
      faq: serializeComplex(sub.faq),
      image: sub.image ? resolvePublicUrl(sub.image) || sub.image : "",
      taxRate: normalizeNum(sub.taxRate),
      taxType: castToString(sub.taxType || "GST"),
      commissionRate: "",
      commissionType: "",
      showInMegaMenu: "",
      megaMenuOrder: "",
      sortOrder: "",
    });
  }

  for (const child of childCategories) {
    const parentSub = resolveParentSubcategoryDoc(child, subById);
    rows.push({
      contractVersion: CATEGORY_CONTRACT_VERSION,
      level: "childCategory",
      name: child.name || "",
      slug: castToString(child.slug),
      parentCategory: parentSub ? resolveCategoryParentRef(parentSub.category, catById) : "",
      parentSubcategory: resolveSubcategoryParentRef(child.subcategory, subById),
      title: castToString(child.title),
      description: castToString(formatTaxonomyDescriptionForExport(child.description)),
      faq: serializeComplex(child.faq),
      image: child.image ? resolvePublicUrl(child.image) || child.image : "",
      taxRate: normalizeNum(child.taxRate),
      taxType: castToString(child.taxType || "GST"),
      commissionRate: "",
      commissionType: "",
      showInMegaMenu: "",
      megaMenuOrder: "",
      sortOrder: "",
    });
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  return XLSX.utils.sheet_to_csv(worksheet);
}

function formatCategoriesForOperatorExport(categories, subcategories, childCategories) {
  const rows = buildCatalogueCategoryExportRows(categories, subcategories, childCategories).map(
    pickCatalogueCategoryFields
  );
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [], {
    header: CATEGORY_CATALOGUE_COLUMNS,
  });
  return XLSX.utils.sheet_to_csv(worksheet);
}

function formatCategoriesForOperatorExportXlsx(categories, subcategories, childCategories) {
  const rows = buildCatalogueCategoryExportRows(categories, subcategories, childCategories).map(
    pickCatalogueCategoryFields
  );
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [], {
    header: CATEGORY_CATALOGUE_COLUMNS,
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Categories");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function formatCategoriesForFullExportXlsx(categories, subcategories, childCategories) {
  const csv = formatCategoriesForExport(categories, subcategories, childCategories);
  const workbook = XLSX.read(csv, { type: "string" });
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

/**
 * Build human-readable path rows for XLSX only: Category | Subcategory | Child Category.
 * Hierarchy order; display names (not slugs). One row per leaf path:
 * - child present → full three names
 * - sub with no children → empty child cell
 * - category with no subs → empty sub + child cells
 */
function buildPathExportRows(categories, subcategories, childCategories) {
  const rows = [];
  const catById = new Map(categories.map((c) => [String(c._id), c]));
  const subsByCategoryId = new Map();
  const childrenBySubId = new Map();

  for (const sub of subcategories) {
    const key = String(sub.category);
    if (!subsByCategoryId.has(key)) subsByCategoryId.set(key, []);
    subsByCategoryId.get(key).push(sub);
  }
  for (const child of childCategories) {
    const key = String(child.subcategory);
    if (!childrenBySubId.has(key)) childrenBySubId.set(key, []);
    childrenBySubId.get(key).push(child);
  }
  for (const list of subsByCategoryId.values()) list.sort(compareByName);
  for (const list of childrenBySubId.values()) list.sort(compareByName);

  const emittedSubIds = new Set();
  const emittedChildIds = new Set();

  for (const cat of categories) {
    const catName = displayName(cat);
    const subs = subsByCategoryId.get(String(cat._id)) || [];
    if (subs.length === 0) {
      rows.push({ category: catName, subcategory: "", childCategory: "" });
      continue;
    }
    for (const sub of subs) {
      emittedSubIds.add(String(sub._id));
      const subName = displayName(sub);
      const children = childrenBySubId.get(String(sub._id)) || [];
      if (children.length === 0) {
        rows.push({ category: catName, subcategory: subName, childCategory: "" });
        continue;
      }
      for (const child of children) {
        emittedChildIds.add(String(child._id));
        rows.push({
          category: catName,
          subcategory: subName,
          childCategory: displayName(child),
        });
      }
    }
  }

  // Orphans still appear so XLSX covers unresolved parents (empty parent name if unresolved)
  for (const sub of subcategories) {
    if (emittedSubIds.has(String(sub._id))) continue;
    const parent = catById.get(String(sub.category));
    const catName = displayName(parent);
    const subName = displayName(sub);
    const children = childrenBySubId.get(String(sub._id)) || [];
    emittedSubIds.add(String(sub._id));
    if (children.length === 0) {
      rows.push({ category: catName, subcategory: subName, childCategory: "" });
      continue;
    }
    for (const child of children) {
      emittedChildIds.add(String(child._id));
      rows.push({
        category: catName,
        subcategory: subName,
        childCategory: displayName(child),
      });
    }
  }

  const subById = new Map(subcategories.map((s) => [String(s._id), s]));
  for (const child of childCategories) {
    if (emittedChildIds.has(String(child._id))) continue;
    const parentSub = subById.get(String(child.subcategory));
    const parentCat = parentSub ? catById.get(String(parentSub.category)) : null;
    rows.push({
      category: displayName(parentCat),
      subcategory: displayName(parentSub),
      childCategory: displayName(child),
    });
  }

  return rows;
}

/**
 * Render hierarchy path workbook (presentation only; not importable).
 * Lazy-loads ExcelJS so CSV-only processes avoid the init cost.
 * @returns {Promise<Buffer>}
 */
async function formatCategoriesForExportXlsx(categories, subcategories, childCategories) {
  // Lazy require: ExcelJS@4.4.0 (MIT) — XLSX path sheet only; CSV/import stay on SheetJS.
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Anbazar";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Taxonomy", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headerRow = sheet.addRow(PATH_HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle" };
  });

  const exportRows = buildPathExportRows(categories, subcategories, childCategories);
  for (const entry of exportRows) {
    sheet.addRow([entry.category, entry.subcategory, entry.childCategory]);
  }

  sheet.getColumn(1).width = PATH_COLUMN_WIDTHS.category;
  sheet.getColumn(2).width = PATH_COLUMN_WIDTHS.subcategory;
  sheet.getColumn(3).width = PATH_COLUMN_WIDTHS.childCategory;

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = {
  CATEGORY_CONTRACT_VERSION,
  CATEGORY_CSV_COLUMNS,
  CATEGORY_MARKETPLACE_COLUMNS,
  formatCategoriesForExport,
  formatCategoriesForOperatorExport,
  formatCategoriesForOperatorExportXlsx,
  formatCategoriesForFullExportXlsx,
  formatCategoriesForExportXlsx,
  buildPathExportRows,
  buildCatalogueCategoryExportRows,
};
