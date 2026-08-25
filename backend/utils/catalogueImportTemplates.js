// backend/utils/catalogueImportTemplates.js
// Operator-facing templates built from the live export contracts.
// Column keys must match import/export — do not invent catalogue attributes.

const XLSX = require("xlsx");
const {
  CATALOGUE_CSV_COLUMNS,
  CATALOGUE_REQUIRED,
  LIST_DELIMITER,
  FAQ_ENTRY_DELIMITER,
} = require("./productCatalogueContract");
const {
  CATEGORY_CONTRACT_VERSION,
  CATEGORY_CSV_COLUMNS,
} = require("./categoryExportService");
const {
  CATEGORY_CATALOGUE_COLUMNS,
  CATEGORY_CATALOGUE_REQUIRED,
} = require("./categoryCatalogueContract");
const { CONTRACT_VERSION, isXlsxImportEnabled } = require("./productImportExport/constants");

const PRODUCT_MARKETPLACE_COLUMNS = ["sellerShopName", "sellerName"];
const CATEGORY_MARKETPLACE_COLUMNS = ["commissionRate", "commissionType"];

const PRODUCT_REQUIRED = CATALOGUE_REQUIRED;

const PRODUCT_COLUMN_META = {
  productName: {
    group: "Required",
    required: true,
    description: "Product name as it should appear in the catalogue.",
    example: "22K Gold Stud Earrings",
  },
  sku: {
    group: "Identity",
    required: false,
    description: "Leave blank to auto-generate. Required when updating an existing product.",
    example: "AUR-EAR-001",
  },
  category: {
    group: "Required",
    required: true,
    description: "Top-level category name or slug. Must already exist (import categories first if needed).",
    example: "Earrings",
  },
  subcategory: {
    group: "Categories",
    required: false,
    description: "Subcategory name or slug under the category above.",
    example: "Studs",
  },
  childCategory: {
    group: "Categories",
    required: false,
    description: "Child category name or slug under the subcategory.",
    example: "",
  },
  listPrice: {
    group: "Required",
    required: true,
    description: "List price in INR (number only).",
    example: "12500",
  },
  salePrice: {
    group: "Pricing",
    required: false,
    description: "Optional sale/offer price. Must be a number greater than 0 if set.",
    example: "",
  },
  stock: {
    group: "Required",
    required: true,
    description: "On-hand quantity.",
    example: "8",
  },
  weight: {
    group: "Shipping",
    required: false,
    description: "Product weight in grams.",
    example: "4.2",
  },
  hsnCode: {
    group: "Tax",
    required: false,
    description: "HSN code for GST, if used.",
    example: "7113",
  },
  taxRate: {
    group: "Tax",
    required: false,
    description: "GST % if overriding category tax.",
    example: "3",
  },
  taxIncluded: {
    group: "Tax",
    required: false,
    description: "TRUE if the listed price already includes GST.",
    example: "TRUE",
  },
  mainImage: {
    group: "Media",
    required: false,
    description: "http(s) URL of the main product image.",
    example: "",
  },
  galleryImages: {
    group: "Media",
    required: false,
    description: `Additional image URLs separated by "${LIST_DELIMITER.trim()}".`,
    example: "",
  },
  video: {
    group: "Media",
    required: false,
    description: "http(s) URL of a product video.",
    example: "",
  },
  description: {
    group: "Content",
    required: false,
    description: "Full product description.",
    example: "",
  },
  care: {
    group: "Content",
    required: false,
    description: "Care and handling instructions.",
    example: "",
  },
  manufacturerDetails: {
    group: "Content",
    required: false,
    description: "Manufacturer or maker details.",
    example: "",
  },
  keyFeatures: {
    group: "Content",
    required: false,
    description: `Key features separated by "${LIST_DELIMITER.trim()}" (e.g. Lightweight | Hypoallergenic).`,
    example: "",
  },
  faq: {
    group: "Content",
    required: false,
    description: `Q&A pairs: question${LIST_DELIMITER}answer, multiple entries separated by "${FAQ_ENTRY_DELIMITER.trim()}".`,
    example: "",
  },
};

const CATEGORY_COLUMN_META = {
  level: {
    group: "Required",
    required: true,
    description:
      "Hierarchy level: category (top level), subcategory, or childCategory. Use these exact values.",
    example: "category",
  },
  name: {
    group: "Required",
    required: true,
    description: "Display name for this category node.",
    example: "Earrings",
  },
  slug: {
    group: "Recommended",
    required: false,
    description:
      "URL slug (lowercase, hyphens). Auto-generated from name when blank. Used to match updates on re-import.",
    example: "earrings",
  },
  parentCategory: {
    group: "Hierarchy",
    required: false,
    description:
      "Required for subcategory and childCategory rows. Prefer the parent category display name (slug also accepted).",
    example: "Earrings",
  },
  parentSubcategory: {
    group: "Hierarchy",
    required: false,
    description:
      "Required for childCategory rows. Prefer the parent subcategory display name (slug also accepted).",
    example: "Studs",
  },
  image: {
    group: "Media",
    required: false,
    description: "Category image URL or filename (jpg, png, gif, webp, svg). Applies at every level.",
    example: "",
  },
  taxRate: {
    group: "Tax",
    required: false,
    description: "GST % for this node (inherits from parent when blank on create).",
    example: "3",
  },
  taxType: {
    group: "Tax",
    required: false,
    description: "Tax type — usually GST.",
    example: "GST",
  },
};

function parseCsvHeaderLine(csv) {
  if (!csv) return [];
  const line = String(csv).split(/\r?\n/)[0] || "";
  const worksheet = XLSX.read(line, { type: "string" });
  const sheet = worksheet.Sheets[worksheet.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  return (rows[0] || []).map((cell) => String(cell).trim()).filter(Boolean);
}

function categoryExportHeaders() {
  return [...CATEGORY_CATALOGUE_COLUMNS];
}

function operatorProductHeaders() {
  return [...CATALOGUE_CSV_COLUMNS];
}

function operatorCategoryHeaders() {
  return [...CATEGORY_CATALOGUE_COLUMNS];
}

function buildProductExampleRow(headers) {
  const row = {};
  for (const key of headers) {
    const meta = PRODUCT_COLUMN_META[key];
    row[key] = meta && meta.example !== undefined ? meta.example : "";
  }
  row.productName = "22K Gold Stud Earrings";
  row.sku = "AUR-EAR-001";
  row.listPrice = 12500;
  row.stock = 8;
  row.category = "Earrings";
  row.subcategory = "Studs";
  row.weight = "4.2";
  row.taxIncluded = "TRUE";
  return row;
}

function buildCategoryExampleRows(headers) {
  const blank = () => {
    const row = {};
    for (const key of headers) row[key] = "";
    row.taxType = "GST";
    return row;
  };

  const category = blank();
  category.level = "category";
  category.name = "Earrings";
  category.slug = "earrings";
  category.taxRate = 3;

  const subcategory = blank();
  subcategory.level = "subcategory";
  subcategory.name = "Studs";
  subcategory.slug = "studs";
  subcategory.parentCategory = "Earrings";
  subcategory.taxRate = 3;

  const child = blank();
  child.level = "childCategory";
  child.name = "22K Gold";
  child.slug = "22k-gold-studs";
  child.parentCategory = "Earrings";
  child.parentSubcategory = "Studs";
  child.taxRate = 3;

  return [category, subcategory, child];
}

function columnsFromHeaders(headers, metaMap, requiredSet) {
  return headers.map((key) => {
    const meta = metaMap[key] || {};
    const required = requiredSet ? requiredSet.has(key) : Boolean(meta.required);
    return {
      key,
      required,
      group: meta.group || "Other",
      description: meta.description || "Supported export/import field.",
      example: meta.example ?? "",
    };
  });
}

function rowsToCsv(rows) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  return XLSX.utils.sheet_to_csv(worksheet);
}

function rowsToXlsxBuffer(dataSheetName, dataRows, instructionRows) {
  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.json_to_sheet(dataRows);
  XLSX.utils.book_append_sheet(workbook, dataSheet, dataSheetName);
  if (instructionRows && instructionRows.length) {
    const helpSheet = XLSX.utils.json_to_sheet(instructionRows);
    XLSX.utils.book_append_sheet(workbook, helpSheet, "Instructions");
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function instructionRowsForColumns(columns) {
  return columns.map((col) => ({
    Column: col.key,
    Required: col.required ? "Required" : "Optional",
    Group: col.group,
    Description: col.description,
    Example: col.example,
  }));
}

function getProductTemplateSpec() {
  const headers = operatorProductHeaders();
  const columns = columnsFromHeaders(headers, PRODUCT_COLUMN_META, PRODUCT_REQUIRED);
  return {
    type: "product",
    contractVersion: CONTRACT_VERSION,
    xlsxImportEnabled: isXlsxImportEnabled(),
    headers,
    required: columns.filter((c) => c.required).map((c) => c.key),
    optional: columns.filter((c) => !c.required).map((c) => c.key),
    columns,
    omittedMarketplaceColumns: PRODUCT_MARKETPLACE_COLUMNS,
    notes: [
      "This template contains exactly the 20 operator-facing catalogue fields for AAURIKAA.",
      "Required: productName, listPrice, stock, and category.",
      "Shipping slab is set on each product in Admin → Products (required before Publish), not in this spreadsheet.",
      "SKU is optional for new products and required when updating by SKU.",
      "Category names must already exist. Import categories first if you are creating a new hierarchy.",
      "Gallery images and key features use a pipe separator (e.g. image1.jpg | image2.jpg).",
      "FAQ uses question | answer pairs separated by ;; between entries.",
      "Variant products are not managed through this template — use Full Technical Backup export/import for variants.",
      "Full Technical Backup (separate export) retains shipping slab (weightClass) and other internal columns.",
    ],
  };
}

function getCategoryTemplateSpec() {
  const headers = operatorCategoryHeaders();
  const requiredSet = CATEGORY_CATALOGUE_REQUIRED;
  const columns = columnsFromHeaders(headers, CATEGORY_COLUMN_META, requiredSet);
  return {
    type: "category",
    contractVersion: CATEGORY_CONTRACT_VERSION,
    xlsxImportEnabled: isXlsxImportEnabled(),
    headers,
    required: [...requiredSet],
    optional: columns.filter((c) => !c.required).map((c) => c.key),
    columns,
    omittedMarketplaceColumns: CATEGORY_MARKETPLACE_COLUMNS,
    notes: [
      "This template contains exactly the 8 operator-facing category fields for AAURIKAA.",
      "Required on every row: level and name.",
      "slug is optional — it is auto-generated from name when left blank.",
      "level must be category, subcategory, or childCategory (exact backend values).",
      "Subcategory rows need parentCategory. Child category rows need parentCategory and parentSubcategory.",
      "Import parents before children, or list parent rows first in the file.",
      "image, taxRate, and taxType apply independently at Category, Subcategory, and Child Category levels.",
      "Full Technical Backup (separate export) retains SEO, FAQ, mega menu, and compatibility columns.",
    ],
  };
}

function buildProductTemplate(format) {
  const spec = getProductTemplateSpec();
  const example = buildProductExampleRow(spec.headers);
  if (format === "xlsx") {
    return {
      filename: "aaurikaa_product_import_template.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: rowsToXlsxBuffer("Products", [example], instructionRowsForColumns(spec.columns)),
    };
  }
  return {
    filename: "aaurikaa_product_import_template.csv",
    contentType: "text/csv",
    buffer: Buffer.from(rowsToCsv([example]), "utf8"),
  };
}

function buildCategoryTemplate(format) {
  const spec = getCategoryTemplateSpec();
  const examples = buildCategoryExampleRows(spec.headers);
  if (format === "xlsx") {
    return {
      filename: "aaurikaa_category_import_template.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: rowsToXlsxBuffer("Categories", examples, instructionRowsForColumns(spec.columns)),
    };
  }
  return {
    filename: "aaurikaa_category_import_template.csv",
    contentType: "text/csv",
    buffer: Buffer.from(rowsToCsv(examples), "utf8"),
  };
}

module.exports = {
  PRODUCT_MARKETPLACE_COLUMNS,
  CATEGORY_MARKETPLACE_COLUMNS,
  PRODUCT_REQUIRED,
  getProductTemplateSpec,
  getCategoryTemplateSpec,
  buildProductTemplate,
  buildCategoryTemplate,
  operatorProductHeaders,
  operatorCategoryHeaders,
};
