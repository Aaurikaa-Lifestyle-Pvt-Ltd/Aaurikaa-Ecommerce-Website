const express = require("express");
const router = express.Router();
const {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getSubcategoriesByCategoryId,
  getChildCategoriesBySubcategoryId,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  createChildCategory,
  updateChildCategory,
  deleteChildCategory,
  getMegaMenuCategories,
  updateCategoryCommission,
  getCategoryHierarchy,
  exportCategories,
  downloadCategoryImportTemplate,
  validateCategoryImport,
  importCategories,
} = require("../controllers/categoryController");

const bulkUpload = require("../middleware/bulkUpload");
const {
  validateInput,
  validateCategoryUpdate,
  validateSubcategory,
  validateSubcategoryUpdate,
  validateChildCategory,
  validateChildCategoryUpdate,
  VALIDATION_RULES,
} = require("../middleware/validation");
const { r2Uploads, handleUploadError } = require("../middleware/secureUpload");
const { verifyAdmin, loadAdminContext, requirePermission } = require("../utils/adminAuthChain");

const upload = r2Uploads.categoryImage();
const adminTaxonomy = [verifyAdmin, loadAdminContext];

router.get("/mega-menu", getMegaMenuCategories);
router.get("/hierarchy", ...adminTaxonomy, requirePermission("taxonomy", "view"), getCategoryHierarchy);
router.get("/export", ...adminTaxonomy, requirePermission("taxonomy", "view"), exportCategories);
router.get("/import-template", ...adminTaxonomy, requirePermission("taxonomy", "manage"), downloadCategoryImportTemplate);
router.post(
  "/import/validate",
  ...adminTaxonomy,
  requirePermission("taxonomy", "manage"),
  bulkUpload.upload,
  bulkUpload.handleUploadError,
  validateCategoryImport
);
router.post(
  "/import",
  ...adminTaxonomy,
  requirePermission("taxonomy", "manage"),
  bulkUpload.upload,
  bulkUpload.handleUploadError,
  importCategories
);
router.get("/", getAllCategories);
router.post(
  "/",
  ...adminTaxonomy,
  requirePermission("taxonomy", "manage"),
  upload,
  handleUploadError,
  validateInput(VALIDATION_RULES.category),
  createCategory
);

router.get("/:categoryId/subcategories", getSubcategoriesByCategoryId);
router.get("/subcategories/:subcategoryId/child-categories", getChildCategoriesBySubcategoryId);

router.post(
  "/:categoryId/subcategories",
  ...adminTaxonomy,
  requirePermission("taxonomy", "manage"),
  upload,
  handleUploadError,
  validateInput(VALIDATION_RULES.subcategory),
  createSubcategory
);
router.put(
  "/subcategories/:id",
  ...adminTaxonomy,
  requirePermission("taxonomy", "manage"),
  upload,
  handleUploadError,
  validateSubcategoryUpdate,
  updateSubcategory
);
router.delete(
  "/subcategories/:id",
  ...adminTaxonomy,
  requirePermission("taxonomy", "manage"),
  deleteSubcategory
);

router.post(
  "/subcategories/:subcategoryId/child-categories",
  ...adminTaxonomy,
  requirePermission("taxonomy", "manage"),
  upload,
  handleUploadError,
  validateInput(VALIDATION_RULES.childCategory),
  createChildCategory
);
router.put(
  "/child-categories/:id",
  ...adminTaxonomy,
  requirePermission("taxonomy", "manage"),
  upload,
  handleUploadError,
  validateChildCategoryUpdate,
  updateChildCategory
);
router.delete(
  "/child-categories/:id",
  ...adminTaxonomy,
  requirePermission("taxonomy", "manage"),
  deleteChildCategory
);

router.get("/:id", getCategoryById);
router.put(
  "/:id",
  ...adminTaxonomy,
  requirePermission("taxonomy", "manage"),
  upload,
  handleUploadError,
  validateCategoryUpdate,
  updateCategory
);
router.put(
  "/:id/commission",
  ...adminTaxonomy,
  requirePermission("taxonomy", "manage"),
  updateCategoryCommission
);
router.delete(
  "/:id",
  ...adminTaxonomy,
  requirePermission("taxonomy", "manage"),
  deleteCategory
);

module.exports = router;
