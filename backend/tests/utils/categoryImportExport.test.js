const mongoose = require("mongoose");
const XLSX = require("xlsx");
const ExcelJS = require("exceljs");
const Category = require("../../models/Category");
const Subcategory = require("../../models/Subcategory");
const ChildCategory = require("../../models/ChildCategory");
const {
  formatCategoriesForExport,
  formatCategoriesForExportXlsx,
  buildPathExportRows,
  CATEGORY_CONTRACT_VERSION,
} = require("../../utils/categoryExportService");
const {
  validateCategoryImport,
  parseCsvBuffer,
  normalizeImportedCategoryImage,
  importCategoryRows,
} = require("../../utils/categoryImportService");
const { exportCategories } = require("../../controllers/categoryController");

/** Frozen CSV machine-contract columns (category-v1). */
const CSV_EXPORT_COLUMNS = [
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

function buildCsvBuffer(rows) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(sheet);
  return Buffer.from(csv, "utf8");
}

async function loadXlsxWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function cellHasFill(cell) {
  const fill = cell.fill;
  if (!fill || fill.type === "none" || !fill.pattern || fill.pattern === "none") return false;
  return Boolean(fill.fgColor);
}

function mockLeanFind(docs) {
  const lean = jest.fn().mockResolvedValue(docs);
  const sort = jest.fn().mockReturnValue({ lean });
  const populate = jest.fn().mockReturnValue({ sort, lean });
  return { sort, populate, lean };
}

function createMockRes() {
  let settle;
  const done = new Promise((resolve) => {
    settle = resolve;
  });
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    done,
    setHeader: jest.fn((key, value) => {
      res.headers[key] = value;
    }),
    status: jest.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    send: jest.fn((body) => {
      res.body = body;
      settle(res);
      return res;
    }),
    json: jest.fn((body) => {
      res.body = body;
      settle(res);
      return res;
    }),
  };
  return res;
}

/** asyncHandler does not return its Promise — wait on res.send/json instead. */
async function invokeExportCategories(req) {
  const res = createMockRes();
  const next = jest.fn((err) => {
    res.nextError = err;
    if (!res.body && res.statusCode == null) {
      res.statusCode = 500;
      res.json({ success: false, message: String(err) });
    }
  });
  exportCategories(req, res, next);
  await res.done;
  return { res, next };
}

describe("categoryExportService", () => {
  const cat = {
    _id: "507f1f77bcf86cd799439001",
    name: "Electronics",
    slug: "electronics",
    title: "Shop Electronics",
    description: "<p>Desc</p>",
    faq: [{ question: "Q?", answer: "A" }],
    image: "cat-banner.webp",
    taxRate: 18,
    taxType: "GST",
    commissionRate: 5,
    commissionType: "percentage",
    showInMegaMenu: true,
    megaMenuOrder: 1,
    sortOrder: 0,
  };

  const sub = {
    _id: "507f1f77bcf86cd799439011",
    name: "Phones",
    slug: "phones",
    category: cat._id,
    image: "phones-banner.webp",
    taxRate: 18,
    taxType: "GST",
  };

  const child = {
    _id: "507f1f77bcf86cd799439021",
    name: "Android",
    slug: "android",
    subcategory: sub._id,
    image: "android-phones.png",
    taxRate: 18,
    taxType: "GST",
  };

  it("exports CSV with contract version and hierarchy columns", () => {
    const csv = formatCategoriesForExport([cat], [sub], [child]);
    expect(csv).toContain(CATEGORY_CONTRACT_VERSION);
    expect(csv).toContain("electronics");
    expect(csv).toContain("phones");
    expect(csv).toContain("cat-banner.webp");
    expect(csv).toContain("phones-banner.webp");
    expect(csv).toContain("android-phones.png");
    expect(csv).toContain("subcategory");
    expect(csv).toContain("category");
    expect(csv).toContain("childCategory");
  });
});

describe("normalizeImportedCategoryImage", () => {
  it("returns undefined for empty values", () => {
    expect(normalizeImportedCategoryImage("")).toBeUndefined();
    expect(normalizeImportedCategoryImage(null)).toBeUndefined();
  });

  it("accepts bare filenames", () => {
    expect(normalizeImportedCategoryImage("phones-banner.webp")).toBe("phones-banner.webp");
  });

  it("strips uploads/categories prefix", () => {
    expect(normalizeImportedCategoryImage("/uploads/categories/hero.jpg")).toBe("hero.jpg");
  });

  it("accepts https URLs with image extension", () => {
    const url = "https://cdn.example.com/categories/hero.png";
    expect(normalizeImportedCategoryImage(url)).toBe("categories/hero.png");
  });

  it("stores R2 gallery URLs as object keys", () => {
    const url =
      "https://pub-f0c433ea683a4e2785bca723b1771d8f.r2.dev/admin/gallery/1787409018775_0a69349ed5b1b298189391c30cccecfe_ChatGPT_Image_Aug_21__2026__06_00_10_PM.webp";
    expect(normalizeImportedCategoryImage(url)).toBe(
      "admin/gallery/1787409018775_0a69349ed5b1b298189391c30cccecfe_ChatGPT_Image_Aug_21__2026__06_00_10_PM.webp"
    );
  });
});

describe("categoryImportService validation", () => {
  it("rejects rows with missing name", async () => {
    const buffer = buildCsvBuffer([{ level: "category", name: "", parentCategory: "" }]);
    const result = await validateCategoryImport(buffer);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts valid category row without image", async () => {
    const buffer = buildCsvBuffer([
      {
        level: "category",
        name: "Test Cat",
        slug: "test-cat",
        parentCategory: "",
        parentSubcategory: "",
        image: "",
      },
    ]);
    const rows = parseCsvBuffer(buffer);
    expect(rows).toHaveLength(1);
    const result = await validateCategoryImport(buffer);
    expect(result.valid).toBe(true);
  });

  it("accepts catalogue rows without slug when name is present", async () => {
    const buffer = buildCsvBuffer([
      {
        level: "category",
        name: "Bracelets",
      },
      {
        level: "subcategory",
        name: "Chain Bracelets",
        parentCategory: "bracelets",
      },
    ]);
    const result = await validateCategoryImport(buffer);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects invalid image values", async () => {
    const buffer = buildCsvBuffer([
      { level: "category", name: "Test Cat", slug: "test-cat", image: "not-an-image.txt" },
    ]);
    const result = await validateCategoryImport(buffer);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/image must be a valid/i);
  });
});

describe("categoryImportService integration", () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_TEST_URI || "mongodb://localhost:27017/ecommerce_test"
      );
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await ChildCategory.deleteMany({});
    await Subcategory.deleteMany({});
    await Category.deleteMany({});
  });

  it("export → import preserves image fields for all taxonomy levels", async () => {
    const category = await Category.create({
      name: "Electronics",
      image: "cat-banner.webp",
      title: "Shop Electronics",
    });
    const subcategory = await Subcategory.create({
      name: "Phones",
      category: category._id,
      image: "phones-banner.webp",
    });
    const childCategory = await ChildCategory.create({
      name: "Android",
      subcategory: subcategory._id,
      image: "android-phones.png",
    });

    const csv = formatCategoriesForExport(
      [category.toObject()],
      [subcategory.toObject()],
      [childCategory.toObject()]
    );
    const buffer = Buffer.from(csv, "utf8");

    await ChildCategory.deleteMany({});
    await Subcategory.deleteMany({});
    await Category.deleteMany({});

    const result = await importCategoryRows(buffer);
    expect(result.imported).toBe(3);
    expect(result.errors).toHaveLength(0);

    const importedCat = await Category.findOne({ slug: "electronics" });
    const importedSub = await Subcategory.findOne({ slug: "phones" });
    const importedChild = await ChildCategory.findOne({ slug: "android" });

    expect(importedCat.image).toBe("cat-banner.webp");
    expect(importedSub.image).toBe("phones-banner.webp");
    expect(importedChild.image).toBe("android-phones.png");
    expect(importedCat.title).toBe("Shop Electronics");
  });

  it("imports rows without image without clearing image on update", async () => {
    const category = await Category.create({
      name: "Books",
      image: "books-cover.jpg",
    });

    const buffer = buildCsvBuffer([
      {
        level: "category",
        name: "Books",
        slug: "books",
        title: "Read Books",
        image: "",
        parentCategory: "",
        parentSubcategory: "",
      },
    ]);

    const result = await importCategoryRows(buffer);
    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);

    const updated = await Category.findById(category._id);
    expect(updated.title).toBe("Read Books");
    expect(updated.image).toBe("books-cover.jpg");
  });

  it("reports duplicate category as row-level error without HTTP throw", async () => {
    await Category.create({ name: "Electronics" });

    const buffer = buildCsvBuffer([
      { level: "category", name: "Electronics", slug: "other-slug", image: "" },
    ]);

    const result = await importCategoryRows(buffer);
    expect(result.imported).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/Duplicate category name/i);
    expect(await Category.countDocuments()).toBe(1);
  });

  it("reports duplicate subcategory slug as row-level error", async () => {
    const category = await Category.create({ name: "Electronics" });
    await Subcategory.create({ name: "Phones", category: category._id });
    await Subcategory.create({ name: "Beta", category: category._id });

    const buffer = buildCsvBuffer([
      {
        level: "subcategory",
        name: "Beta",
        slug: "phones",
        parentCategory: "electronics",
        image: "",
      },
    ]);

    const result = await importCategoryRows(buffer);
    expect(result.imported).toBe(0);
    expect(result.errors[0].message).toMatch(/Duplicate subcategory slug/i);
  });

  it("reports duplicate child category slug as row-level error", async () => {
    const category = await Category.create({ name: "Electronics" });
    const subcategory = await Subcategory.create({ name: "Phones", category: category._id });
    await ChildCategory.create({ name: "Android", subcategory: subcategory._id });
    await ChildCategory.create({ name: "Beta", subcategory: subcategory._id });

    const buffer = buildCsvBuffer([
      {
        level: "childCategory",
        name: "Beta",
        slug: "android",
        parentCategory: "electronics",
        parentSubcategory: "phones",
        image: "",
      },
    ]);

    const result = await importCategoryRows(buffer);
    expect(result.imported).toBe(0);
    expect(result.errors[0].message).toMatch(/Duplicate child category slug/i);
  });

  it("exports TipTap JSON descriptions as HTML in CSV", async () => {
    const tiptapDescription = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Rich description" }],
        },
      ],
    });
    const exportCat = {
      _id: "507f1f77bcf86cd799439001",
      name: "Electronics",
      slug: "electronics",
      description: tiptapDescription,
    };
    const csv = formatCategoriesForExport([exportCat], [], []);
    expect(csv).toContain("<p>");
    expect(csv).toContain("Rich description");
    expect(csv).not.toContain('"type":"doc"');
  });

  it("imports HTML description cells as TipTap JSON", async () => {
    const buffer = buildCsvBuffer([
      {
        level: "category",
        name: "HTML Cat",
        slug: "html-cat",
        description: "<p>Imported <strong>HTML</strong></p>",
        parentCategory: "",
        parentSubcategory: "",
        image: "",
      },
    ]);

    const result = await importCategoryRows(buffer);
    expect(result.imported).toBe(1);

    const imported = await Category.findOne({ slug: "html-cat" });
    expect(imported.description).toMatch(/"type":"doc"/);
    expect(imported.description).toContain('"paragraph"');
  });

  it("continues processing and reports mixed valid and invalid rows", async () => {
    await Category.create({ name: "Electronics" });

    const buffer = buildCsvBuffer([
      { level: "category", name: "Fashion", slug: "fashion", image: "" },
      { level: "category", name: "Electronics", slug: "electronics-dup", image: "" },
      { level: "category", name: "Home Decor", slug: "home-decor", image: "" },
    ]);

    const result = await importCategoryRows(buffer);
    expect(result.imported).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
    expect(await Category.countDocuments()).toBe(3);
  });
});

describe("categoryExportService CSV regression (frozen contract)", () => {
  const electronics = {
    _id: "507f1f77bcf86cd799439001",
    name: "Electronics",
    slug: "electronics",
    title: "Shop Electronics",
    description: "<p>Electronics desc</p>",
    faq: [{ question: "Q1?", answer: "A1" }],
    image: "electronics.webp",
    taxRate: 18,
    taxType: "GST",
    commissionRate: 5,
    commissionType: "percentage",
    showInMegaMenu: true,
    megaMenuOrder: 1,
    sortOrder: 0,
  };

  const fashion = {
    _id: "507f1f77bcf86cd799439002",
    name: "Fashion",
    slug: "fashion",
    title: "Shop Fashion",
    description: "<p>Fashion desc</p>",
    faq: [],
    image: "fashion.webp",
    taxRate: 12,
    taxType: "GST",
    commissionRate: 8,
    commissionType: "percentage",
    showInMegaMenu: false,
    megaMenuOrder: 2,
    sortOrder: 1,
  };

  const phones = {
    _id: "507f1f77bcf86cd799439011",
    name: "Phones",
    slug: "phones",
    category: electronics._id,
    title: "Mobile Phones",
    description: "<p>Phones</p>",
    faq: [],
    image: "phones.webp",
    taxRate: 18,
    taxType: "GST",
  };

  const clothing = {
    _id: "507f1f77bcf86cd799439012",
    name: "Clothing",
    slug: "clothing",
    category: fashion._id,
    title: "Apparel",
    description: "",
    faq: [],
    image: "clothing.webp",
    taxRate: 12,
    taxType: "GST",
  };

  const android = {
    _id: "507f1f77bcf86cd799439021",
    name: "Android",
    slug: "android",
    subcategory: phones._id,
    title: "Android Phones",
    description: "<p>Android</p>",
    faq: [{ question: "OS?", answer: "Android" }],
    image: "android.png",
    taxRate: 18,
    taxType: "GST",
  };

  const shirts = {
    _id: "507f1f77bcf86cd799439022",
    name: "Shirts",
    slug: "shirts",
    subcategory: clothing._id,
    title: "Shirts",
    description: "",
    faq: [],
    image: "shirts.png",
    taxRate: 12,
    taxType: "GST",
  };

  const categories = [electronics, fashion];
  const subcategories = [phones, clothing];
  const childCategories = [android, shirts];

  it("keeps level-batched CSV row order (all categories, then subs, then children)", () => {
    const csv = formatCategoriesForExport(categories, subcategories, childCategories);
    const rows = parseCsvBuffer(Buffer.from(csv, "utf8"));

    expect(rows.map((r) => r.level)).toEqual([
      "category",
      "category",
      "subcategory",
      "subcategory",
      "childCategory",
      "childCategory",
    ]);
    expect(rows.map((r) => r.slug)).toEqual([
      "electronics",
      "fashion",
      "phones",
      "clothing",
      "android",
      "shirts",
    ]);
  });

  it("emits contract version and expected column headers", () => {
    const csv = formatCategoriesForExport(categories, subcategories, childCategories);
    const headerLine = csv.split(/\r?\n/)[0];
    for (const key of CSV_EXPORT_COLUMNS) {
      expect(headerLine).toContain(key);
    }
    expect(headerLine).not.toContain("defaultShippingApplicability");
    expect(headerLine).not.toContain("defaultShippingType");
    expect(headerLine).not.toContain("defaultShippingVisibility");
    expect(csv).toContain(CATEGORY_CONTRACT_VERSION);
  });

  it("fills parent columns on every sub and child CSV row", () => {
    const csv = formatCategoriesForExport(categories, subcategories, childCategories);
    const rows = parseCsvBuffer(Buffer.from(csv, "utf8"));
    const subRows = rows.filter((r) => r.level === "subcategory");
    const childRows = rows.filter((r) => r.level === "childCategory");

    expect(subRows.every((r) => String(r.parentCategory).length > 0)).toBe(true);
    expect(childRows.every((r) => String(r.parentCategory).length > 0)).toBe(true);
    expect(childRows.every((r) => String(r.parentSubcategory).length > 0)).toBe(true);
  });
});

describe("categoryExportService XLSX path sheet", () => {
  const cat = {
    _id: "507f1f77bcf86cd799439001",
    name: "Electronics",
    slug: "electronics",
  };

  const sub = {
    _id: "507f1f77bcf86cd799439011",
    name: "Phones",
    slug: "phones",
    category: cat._id,
  };

  const child = {
    _id: "507f1f77bcf86cd799439021",
    name: "Android",
    slug: "android",
    subcategory: sub._id,
  };

  it("returns a loadable Taxonomy workbook buffer", async () => {
    const buffer = await formatCategoriesForExportXlsx([cat], [sub], [child]);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = await loadXlsxWorkbook(buffer);
    expect(workbook.getWorksheet("Taxonomy")).toBeTruthy();
  });

  it("uses Category / Subcategory / Child Category headers with frozen header row", async () => {
    const buffer = await formatCategoriesForExportXlsx([cat], [sub], [child]);
    const workbook = await loadXlsxWorkbook(buffer);
    const sheet = workbook.getWorksheet("Taxonomy");

    const header = sheet.getRow(1);
    expect(header.getCell(1).value).toBe("Category");
    expect(header.getCell(2).value).toBe("Subcategory");
    expect(header.getCell(3).value).toBe("Child Category");
    expect(header.getCell(1).font?.bold).toBe(true);

    const view = sheet.views?.[0] || {};
    expect(view.state).toBe("frozen");
    expect(view.ySplit).toBe(1);
  });

  it("emits hierarchy path rows in order (names, not slugs)", () => {
    const fashion = {
      _id: "507f1f77bcf86cd799439002",
      name: "Fashion",
      slug: "fashion",
    };
    const clothing = {
      _id: "507f1f77bcf86cd799439012",
      name: "Clothing",
      slug: "clothing",
      category: fashion._id,
    };
    const shirts = {
      _id: "507f1f77bcf86cd799439022",
      name: "Shirts",
      slug: "shirts",
      subcategory: clothing._id,
    };
    const bareCategory = {
      _id: "507f1f77bcf86cd799439003",
      name: "Books",
      slug: "books",
    };
    const emptySub = {
      _id: "507f1f77bcf86cd799439013",
      name: "Tablets",
      slug: "tablets",
      category: cat._id,
    };

    const rows = buildPathExportRows(
      [cat, fashion, bareCategory],
      [sub, clothing, emptySub],
      [child, shirts]
    );
    expect(rows).toEqual([
      { category: "Electronics", subcategory: "Phones", childCategory: "Android" },
      { category: "Electronics", subcategory: "Tablets", childCategory: "" },
      { category: "Fashion", subcategory: "Clothing", childCategory: "Shirts" },
      { category: "Books", subcategory: "", childCategory: "" },
    ]);
  });

  it("does not apply coloured fills on header or data cells", async () => {
    const buffer = await formatCategoriesForExportXlsx([cat], [sub], [child]);
    const workbook = await loadXlsxWorkbook(buffer);
    const sheet = workbook.getWorksheet("Taxonomy");

    sheet.eachRow((row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        expect(cellHasFill(cell)).toBe(false);
      });
    });
  });
});

describe("exportCategories format branch", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("defaults to operator CSV with 8 catalogue columns", async () => {
    jest.spyOn(Category, "find").mockReturnValue(
      mockLeanFind([
        {
          _id: "507f1f77bcf86cd799439001",
          name: "Electronics",
          slug: "electronics",
        },
      ])
    );
    jest.spyOn(Subcategory, "find").mockReturnValue(mockLeanFind([]));
    jest.spyOn(ChildCategory, "find").mockReturnValue(mockLeanFind([]));

    const { res, next } = await invokeExportCategories({ query: {} });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("text/csv");
    expect(res.headers["Content-Disposition"]).toBe(
      "attachment; filename=aaurikaa_categories_catalogue.csv"
    );
    expect(typeof res.body).toBe("string");
    expect(res.body.split(/\r?\n/)[0]).toBe(
      "level,name,slug,parentCategory,parentSubcategory,image,taxRate,taxType"
    );
    expect(res.body).not.toContain("contractVersion");
    expect(res.body).toContain("electronics");
  });

  it("profile=full returns technical CSV with contractVersion", async () => {
    jest.spyOn(Category, "find").mockReturnValue(
      mockLeanFind([
        {
          _id: "507f1f77bcf86cd799439001",
          name: "Electronics",
          slug: "electronics",
        },
      ])
    );
    jest.spyOn(Subcategory, "find").mockReturnValue(mockLeanFind([]));
    jest.spyOn(ChildCategory, "find").mockReturnValue(mockLeanFind([]));

    const { res } = await invokeExportCategories({ query: { profile: "full" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Disposition"]).toBe(
      "attachment; filename=aaurikaa_categories_full_technical.csv"
    );
    expect(res.body).toContain("contractVersion");
  });

  it("returns operator XLSX with Categories sheet for format=xlsx", async () => {
    jest.spyOn(Category, "find").mockReturnValue(mockLeanFind([]));
    jest.spyOn(Subcategory, "find").mockReturnValue(mockLeanFind([]));
    jest.spyOn(ChildCategory, "find").mockReturnValue(mockLeanFind([]));

    const { res, next } = await invokeExportCategories({ query: { format: "xlsx" } });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(res.headers["Content-Disposition"]).toBe(
      "attachment; filename=aaurikaa_categories_catalogue.xlsx"
    );
    expect(Buffer.isBuffer(res.body)).toBe(true);

    const workbook = XLSX.read(res.body, { type: "buffer" });
    expect(workbook.SheetNames[0]).toBe("Categories");
  });

  it("returns hierarchy path XLSX when profile=path", async () => {
    jest.spyOn(Category, "find").mockReturnValue(mockLeanFind([]));
    jest.spyOn(Subcategory, "find").mockReturnValue(mockLeanFind([]));
    jest.spyOn(ChildCategory, "find").mockReturnValue(mockLeanFind([]));

    const { res } = await invokeExportCategories({ query: { format: "xlsx", profile: "path" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Disposition"]).toBe(
      "attachment; filename=aaurikaa_categories_hierarchy_view.xlsx"
    );
    const workbook = await loadXlsxWorkbook(res.body);
    expect(workbook.getWorksheet("Taxonomy")).toBeTruthy();
  });

  it("rejects unknown format with 400", async () => {
    const { res, next } = await invokeExportCategories({ query: { format: "pdf" } });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body?.success).toBe(false);
    expect(String(res.body?.message || "")).toMatch(/format=csv or format=xlsx/i);
  });
});
