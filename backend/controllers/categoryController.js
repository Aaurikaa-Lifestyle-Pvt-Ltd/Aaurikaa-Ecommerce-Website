const Category = require("../models/Category");
const Subcategory = require("../models/Subcategory");
const ChildCategory = require("../models/ChildCategory");
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require('../utils/errorHandler');
const CommissionConfigAudit = require("../models/CommissionConfigAudit");
const { applyTranslations } = require('../utils/applyTranslations');
const categoryHierarchyListingService = require('../services/categoryHierarchyListingService');
const {
  formatCategoriesForExport,
  formatCategoriesForOperatorExport,
  formatCategoriesForOperatorExportXlsx,
  formatCategoriesForFullExportXlsx,
  formatCategoriesForExportXlsx,
} = require('../utils/categoryExportService');
const { validateCategoryImport, importCategoryRows } = require('../utils/categoryImportService');
const { getCategoryTemplateSpec, buildCategoryTemplate } = require('../utils/catalogueImportTemplates');
const { resolvePublicUrl } = require('../utils/mediaUrlUtils');
const CATEGORY_TRANSLATABLE_FIELDS = ['name', 'description', 'title'];
const SUBCATEGORY_TRANSLATABLE_FIELDS = ['name', 'description', 'title'];
const CHILD_CATEGORY_TRANSLATABLE_FIELDS = ['name', 'description', 'title'];

function parseFaqField(value) {
  if (value === undefined) return undefined;
  if (value === '' || value === '[]') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function applyTaxonomyContentFields(entity, body, imageFile) {
  if (body.title !== undefined) entity.title = body.title;
  if (body.description !== undefined) entity.description = body.description;
  if (body.faq !== undefined) entity.faq = parseFaqField(body.faq);
  if (imageFile) entity.image = imageFile.filename;
}

/**
 * FormData-safe taxonomy taxRate parse (no schema/GST changes).
 * - omitted → undefined (caller skips / leaves mongoose default)
 * - '' → null (Sub/Child inherit; distinct from explicit 0)
 * - numeric string/number including 0 → Number
 */
function parseTaxonomyTaxRate(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// === HIERARCHY LISTING (Scope J Phase 6) ===
exports.getCategoryHierarchy = asyncHandler(async (req, res) => {
  const { rows, pagination } = await categoryHierarchyListingService.listCategoryHierarchy(
    req.query
  );
  return res.status(HTTP_STATUS.OK).json({
    rows,
    pagination,
  });
});

function withResolvedTaxonomyImage(entity) {
  if (!entity || !entity.image) return entity;
  return { ...entity, image: resolvePublicUrl(entity.image) || entity.image };
}

function withResolvedTaxonomyImages(entities) {
  return (entities || []).map(withResolvedTaxonomyImage);
}

// === MAIN CATEGORY CONTROLLERS ===
exports.getAllCategories = asyncHandler(async (req, res) => {
  // Public storefront + shared list: only active root categories.
  // Subcategory/ChildCategory have no isActive — inactive is Category-level only.
  // Admin hierarchy listing (/hierarchy) is separate and still returns inactive rows.
  const includeInactive =
    String(req.query.includeInactive || "").toLowerCase() === "true";
  const filter = includeInactive ? {} : { isActive: true };
  let categories = await Category.find(filter).sort({ name: 1 }).lean();
  const locale = req.query.locale;
  if (locale && locale !== 'en') {
    categories = await applyTranslations(categories, 'Category', locale, CATEGORY_TRANSLATABLE_FIELDS);
  }
  categories = withResolvedTaxonomyImages(categories);
  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Categories retrieved successfully",
    categories
  );
});

exports.getCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const category = await Category.findById(id);

  if (!category) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.RESOURCE_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Category retrieved successfully",
    category
  );
});


function parseFormBoolean(value) {
  return value === 'true' || value === true || value === '1' || value === 1;
}

exports.createCategory = asyncHandler(async (req, res) => {
  const { name, description, taxRate, taxType, commissionRate, commissionType } = req.body;
  let image = req.file ? req.file.filename : null;
  const parsedTaxRate = parseTaxonomyTaxRate(taxRate);

  try {
    const category = new Category({
      name,
      description,
      image,
      ...(parsedTaxRate !== undefined && parsedTaxRate !== null ? { taxRate: parsedTaxRate } : {}),
      taxType,
      commissionRate,
      commissionType,
      showInMegaMenu: req.body.showInMegaMenu === 'true',
      megaMenuOrder: parseInt(req.body.megaMenuOrder) || 0
    });
    if (req.body.isActive !== undefined) {
      category.isActive = parseFormBoolean(req.body.isActive);
    }
    applyTaxonomyContentFields(category, req.body, req.file);
    await category.save();

    return sendSuccessResponse(
      res,
      HTTP_STATUS.CREATED,
      "✅ Category created successfully",
      category
    );
  } catch (error) {
    if (error.code === 11000) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.CONFLICT,
        "Category name already exists. Please choose a different name.",
        ERROR_CODES.DUPLICATE_ENTRY,
        { field: 'name', value: name }
      );
    }
    throw error; // Re-throw other errors to be handled by asyncHandler
  }
});

exports.updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, taxRate, taxType } = req.body;
  let image = req.file ? req.file.filename : undefined;

  try {
    const category = await Category.findById(id);
    if (!category) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        ERROR_MESSAGES.RESOURCE_NOT_FOUND,
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    if (image) category.image = image;
    if (taxRate !== undefined) {
      const parsedTaxRate = parseTaxonomyTaxRate(taxRate);
      category.taxRate = parsedTaxRate === null ? 0 : parsedTaxRate;
    }
    if (taxType !== undefined) category.taxType = taxType;
    if (req.body.commissionRate !== undefined) category.commissionRate = req.body.commissionRate;
    if (req.body.commissionType !== undefined) category.commissionType = req.body.commissionType;
    if (req.body.showInMegaMenu !== undefined) {
      category.showInMegaMenu = req.body.showInMegaMenu === 'true' || req.body.showInMegaMenu === true;
    }
    if (req.body.megaMenuOrder !== undefined) {
      category.megaMenuOrder = parseInt(req.body.megaMenuOrder) || 0;
    }
    if (req.body.isActive !== undefined) {
      category.isActive = parseFormBoolean(req.body.isActive);
    }
    applyTaxonomyContentFields(category, req.body, req.file);

    const updated = await category.save();

    return sendSuccessResponse(
      res,
      HTTP_STATUS.OK,
      "✅ Category updated successfully",
      updated
    );
  } catch (error) {
    if (error.code === 11000) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.CONFLICT,
        "Category name already exists. Please choose a different name.",
        ERROR_CODES.DUPLICATE_ENTRY,
        { field: 'name', value: name }
      );
    }
    throw error; // Re-throw other errors to be handled by asyncHandler
  }
});

exports.deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await Category.findByIdAndDelete(id);
  if (!deleted) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.RESOURCE_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Category deleted successfully"
  );
});

exports.updateCategoryCommission = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { commissionRate, commissionType, commissionAmount, reason } = req.body;
  const adminId = req.user._id;

  const category = await Category.findById(id);
  if (!category) return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Category not found");

  const changes = [];
  if (commissionRate !== undefined && category.commissionRate !== commissionRate) {
    changes.push({ field: 'commissionRate', oldValue: category.commissionRate, newValue: commissionRate });
    category.commissionRate = commissionRate;
  }
  if (commissionType !== undefined && category.commissionType !== commissionType) {
    changes.push({ field: 'commissionType', oldValue: category.commissionType, newValue: commissionType });
    category.commissionType = commissionType;
  }
  if (commissionAmount !== undefined && category.commissionAmount !== commissionAmount) {
    changes.push({ field: 'commissionAmount', oldValue: category.commissionAmount, newValue: commissionAmount });
    category.commissionAmount = commissionAmount;
  }

  if (changes.length > 0) {
    await category.save();

    await CommissionConfigAudit.create({
      entityType: 'Category',
      entityId: id,
      changes,
      changedBy: adminId,
      reason,
      metadata: { ipAddress: req.ip, userAgent: req.get('User-Agent') }
    });
  }

  return sendSuccessResponse(res, HTTP_STATUS.OK, "Category commission updated", category);
});

// === SUBCATEGORY CONTROLLERS ===
exports.getAllSubcategories = async (req, res) => {
  try {
    const subcategories = await Subcategory.find().sort({ name: 1 });
    res.json(subcategories);
  } catch (err) {
    console.error("❌ Get All Subcategories Error:", err);
    res.status(500).json({ message: "Failed to fetch subcategories" });
  }
};

exports.getSubcategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const subcategory = await Subcategory.findById(id).populate("category");
    if (!subcategory) return res.status(404).json({ message: "Subcategory not found" });
    res.json(subcategory);
  } catch (err) {
    console.error("❌ Get Subcategory By ID Error:", err);
    res.status(500).json({ message: "Failed to fetch subcategory" });
  }
};

exports.getSubcategoriesByCategoryId = async (req, res) => {
  try {
    const { categoryId } = req.params; // category ID
    let subcategories = await Subcategory.find({ category: categoryId }).sort({ name: 1 }).lean();
    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      subcategories = await applyTranslations(subcategories, 'Subcategory', locale, SUBCATEGORY_TRANSLATABLE_FIELDS);
    }
    res.json(subcategories);
  } catch (err) {
    console.error("❌ Get Subcategories By Category ID Error:", err);
    res.status(500).json({ message: "Failed to fetch subcategories" });
  }
};

exports.createSubcategory = async (req, res) => {
  try {
    const { name, taxRate, taxType } = req.body;
    const { categoryId } = req.params;
    if (!name) return res.status(400).json({ message: "Subcategory name is required" });

    const parsedTaxRate = parseTaxonomyTaxRate(taxRate);
    const subcategory = new Subcategory({
      name,
      category: categoryId,
      taxType,
      ...(parsedTaxRate !== undefined ? { taxRate: parsedTaxRate } : {}),
    });
    applyTaxonomyContentFields(subcategory, req.body, req.file);
    await subcategory.save();
    res.status(201).json({ message: "✅ Subcategory created", subcategory });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: "Subcategory name already exists under this category. Please choose a different name."
      });
    }
    console.error("❌ Create Subcategory Error:", err);
    res.status(500).json({ message: "Failed to create subcategory" });
  }
};

exports.updateSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, taxRate, taxType } = req.body;

    const subcategory = await Subcategory.findById(id);
    if (!subcategory) return res.status(404).json({ message: "Subcategory not found" });

    if (name) subcategory.name = name;
    if (taxRate !== undefined) subcategory.taxRate = parseTaxonomyTaxRate(taxRate);
    if (taxType !== undefined) subcategory.taxType = taxType;
    applyTaxonomyContentFields(subcategory, req.body, req.file);

    const updated = await subcategory.save();
    res.json({ message: "✅ Subcategory updated", updated });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: "Subcategory name already exists under this category. Please choose a different name."
      });
    }
    console.error("❌ Update Subcategory Error:", err);
    res.status(500).json({ message: "Failed to update subcategory" });
  }
};

exports.deleteSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    await Subcategory.findByIdAndDelete(id);
    res.json({ message: "✅ Subcategory deleted" });
  } catch (err) {
    console.error("❌ Delete Subcategory Error:", err);
    res.status(500).json({ message: "Failed to delete subcategory" });
  }
};

// === CHILD CATEGORY CONTROLLERS ===
exports.getAllChildCategories = async (req, res) => {
  try {
    const childs = await ChildCategory.find()
      .populate({
        path: "subcategory",
        populate: { path: "category" }, // ✅ category সহ populate হচ্ছে
      })
      .sort({ name: 1 });

    res.json(childs);
  } catch (err) {
    console.error("❌ Get All ChildCategories Error:", err);
    res.status(500).json({ message: "Failed to fetch child categories" });
  }
};

exports.getChildCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const childCategory = await ChildCategory.findById(id)
      .populate({
        path: "subcategory",
        populate: { path: "category" }
      });
    if (!childCategory) return res.status(404).json({ message: "Child category not found" });
    res.json(childCategory);
  } catch (err) {
    console.error("❌ Get ChildCategory By ID Error:", err);
    res.status(500).json({ message: "Failed to fetch child category" });
  }
};

exports.getChildCategoriesBySubcategoryId = async (req, res) => {
  try {
    const { subcategoryId } = req.params; // subcategory ID
    const children = await ChildCategory.find({ subcategory: subcategoryId }).sort({ name: 1 });
    res.json(children);
  } catch (err) {
    console.error("❌ Get ChildCategories By Subcategory ID Error:", err);
    res.status(500).json({ message: "Failed to fetch child categories" });
  }
};

exports.createChildCategory = async (req, res) => {
  try {
    const { name, taxRate, taxType } = req.body;
    const { subcategoryId } = req.params;
    if (!name) return res.status(400).json({ message: "Child category name is required" });

    const parsedTaxRate = parseTaxonomyTaxRate(taxRate);
    const child = new ChildCategory({
      name,
      subcategory: subcategoryId,
      taxType,
      ...(parsedTaxRate !== undefined ? { taxRate: parsedTaxRate } : {}),
    });
    applyTaxonomyContentFields(child, req.body, req.file);
    await child.save();
    res.status(201).json({ message: "✅ Child category created", child });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: "Child category name already exists under this subcategory. Please choose a different name."
      });
    }
    console.error("❌ Create ChildCategory Error:", err);
    res.status(500).json({ message: "Failed to create child category" });
  }
};

exports.updateChildCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, taxRate, taxType } = req.body;

    const childCategory = await ChildCategory.findById(id);
    if (!childCategory) return res.status(404).json({ message: "Child category not found" });

    if (name) childCategory.name = name;
    if (taxRate !== undefined) childCategory.taxRate = parseTaxonomyTaxRate(taxRate);
    if (taxType !== undefined) childCategory.taxType = taxType;
    applyTaxonomyContentFields(childCategory, req.body, req.file);

    const updated = await childCategory.save();
    res.json({ message: "✅ Child category updated", updated });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: "Child category name already exists under this subcategory. Please choose a different name."
      });
    }
    console.error("❌ Update ChildCategory Error:", err);
    res.status(500).json({ message: "Failed to update child category" });
  }
};

exports.deleteChildCategory = async (req, res) => {
  try {
    const { id } = req.params;
    await ChildCategory.findByIdAndDelete(id);
    res.json({ message: "✅ Child category deleted" });
  } catch (err) {
    console.error("❌ Delete ChildCategory Error:", err);
    res.status(500).json({ message: "Failed to delete child category" });
  }
};
// === MEGA MENU CONTROLLER ===
exports.getMegaMenuCategories = asyncHandler(async (req, res) => {
  let categories = await Category.find({
    isActive: true,
    showInMegaMenu: true,
    parentCategory: null,
  })
    .sort({ megaMenuOrder: 1, name: 1 })
    .populate({
      path: 'subcategories',
      populate: {
        path: 'childCategories'
      }
    })
    .lean();

  const locale = req.query.locale;
  if (locale && locale !== 'en') {
    categories = await applyTranslations(categories, 'Category', locale, CATEGORY_TRANSLATABLE_FIELDS);
    for (const cat of categories) {
      if (cat.subcategories && cat.subcategories.length > 0) {
        cat.subcategories = await applyTranslations(cat.subcategories, 'Subcategory', locale, SUBCATEGORY_TRANSLATABLE_FIELDS);
        for (const sub of cat.subcategories) {
          if (sub.childCategories && sub.childCategories.length > 0) {
            sub.childCategories = await applyTranslations(sub.childCategories, 'ChildCategory', locale, CHILD_CATEGORY_TRANSLATABLE_FIELDS);
          }
        }
      }
    }
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Mega menu categories retrieved successfully",
    categories
  );
});

exports.downloadCategoryImportTemplate = asyncHandler(async (req, res) => {
  const rawFormat = req.query.format;
  const format = rawFormat == null || rawFormat === "" ? "csv" : String(rawFormat).toLowerCase();
  if (format === "json") {
    return sendSuccessResponse(res, HTTP_STATUS.OK, "Category import template spec", getCategoryTemplateSpec());
  }
  if (format !== "csv" && format !== "xlsx") {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid format. Use format=csv, format=xlsx, or format=json",
      ERROR_CODES.INVALID_INPUT
    );
  }
  const file = buildCategoryTemplate(format);
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename=${file.filename}`);
  return res.status(HTTP_STATUS.OK).send(file.buffer);
});

exports.exportCategories = asyncHandler(async (req, res) => {
  const rawFormat = req.query.format;
  const format = rawFormat == null || rawFormat === "" ? "csv" : String(rawFormat).toLowerCase();
  if (format !== "csv" && format !== "xlsx") {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid format. Use format=csv or format=xlsx",
      ERROR_CODES.INVALID_INPUT
    );
  }

  const profile = String(req.query.profile || "operator").toLowerCase();
  if (profile !== "full" && profile !== "operator" && profile !== "path") {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid profile. Use profile=operator, profile=full, or profile=path",
      ERROR_CODES.INVALID_INPUT
    );
  }

  const [categories, subcategories, childCategories] = await Promise.all([
    Category.find().sort({ sortOrder: 1, name: 1 }).lean(),
    Subcategory.find()
      .populate('category', 'name slug')
      .sort({ name: 1 })
      .lean(),
    ChildCategory.find()
      .populate({
        path: 'subcategory',
        select: 'name slug category',
        populate: { path: 'category', select: 'name slug' },
      })
      .sort({ name: 1 })
      .lean(),
  ]);

  if (format === "xlsx") {
    let buffer;
    let filename;
    if (profile === "full") {
      buffer = formatCategoriesForFullExportXlsx(categories, subcategories, childCategories);
      filename = "aaurikaa_categories_full_technical.xlsx";
    } else if (profile === "path") {
      buffer = await formatCategoriesForExportXlsx(categories, subcategories, childCategories);
      filename = "aaurikaa_categories_hierarchy_view.xlsx";
    } else {
      buffer = formatCategoriesForOperatorExportXlsx(categories, subcategories, childCategories);
      filename = "aaurikaa_categories_catalogue.xlsx";
    }
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    return res.status(HTTP_STATUS.OK).send(buffer);
  }

  const csv =
    profile === "full"
      ? formatCategoriesForExport(categories, subcategories, childCategories)
      : formatCategoriesForOperatorExport(categories, subcategories, childCategories);
  const filenameBase =
    profile === "full" ? "aaurikaa_categories_full_technical" : "aaurikaa_categories_catalogue";
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=${filenameBase}.csv`);
  return res.status(HTTP_STATUS.OK).send(csv);
});

exports.validateCategoryImport = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) {
    return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "CSV file is required", ERROR_CODES.INVALID_INPUT);
  }
  const result = await validateCategoryImport(req.file.buffer);
  if (!result.valid) {
    return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Validation failed", ERROR_CODES.INVALID_INPUT, {
      errors: result.errors,
      warnings: result.warnings || [],
      validRows: result.validRows,
      totalRows: result.totalRows,
      newRecords: result.newRecords,
      updates: result.updates,
      skipped: result.skipped,
    });
  }
  return sendSuccessResponse(res, HTTP_STATUS.OK, "Validation passed", {
    validRows: result.validRows,
    totalRows: result.totalRows,
    newRecords: result.newRecords,
    updates: result.updates,
    skipped: result.skipped,
    warnings: result.warnings || [],
    errors: [],
  });
});

exports.importCategories = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) {
    return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "CSV file is required", ERROR_CODES.INVALID_INPUT);
  }
  try {
    const result = await importCategoryRows(req.file.buffer);
    if (result.errors?.length > 0 && result.imported === 0) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Import failed", ERROR_CODES.INVALID_INPUT, {
        errors: result.errors,
        imported: result.imported,
        failed: result.failed,
        totalRows: result.totalRows,
      });
    }
    const message =
      result.errors?.length > 0
        ? "Categories imported with row-level errors"
        : "Categories imported";
    return sendSuccessResponse(res, HTTP_STATUS.OK, message, result);
  } catch (err) {
    if (err.code === "VALIDATION_FAILED") {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, err.message, ERROR_CODES.INVALID_INPUT, {
        errors: err.errors || [],
      });
    }
    if (err.code === "EMPTY_FILE") {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, err.message, ERROR_CODES.INVALID_INPUT);
    }
    throw err;
  }
});
