const Brand = require('../models/brand');
const fs = require('fs');
const path = require('path');
const cache = require('../utils/cache');
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require('../utils/errorHandler');
const { deleteMediaObject } = require('../services/r2UploadService');
const { applyTranslations } = require('../utils/applyTranslations');
const brandListingService = require('../services/brandListingService');

function invalidateHomepageBundleCache() {
  const keys = cache.keys();
  keys.filter((k) => k.startsWith('homepage-bundle-')).forEach((k) => cache.del(k));
}

// 🔧 helper function to get full path
const getAbsolutePath = (relativePath) => path.resolve(__dirname, '..', '..', relativePath);

const normalizeBrandName = (raw) => {
  if (raw === null || raw === undefined) return "";
  return String(raw).trim().replace(/\s+/g, " ");
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findExistingBrandByNameCI = async (name) => {
  const normalized = normalizeBrandName(name);
  if (!normalized) return null;
  return Brand.findOne({ name: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, "i") } });
};

// ========== ✅ Add New Brand ==========
exports.addBrand = asyncHandler(async (req, res) => {
  const rawName = req.body?.name;
  const name = normalizeBrandName(rawName);
  if (!name) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Brand name is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  // Handle R2 URLs (full URLs) vs local filenames
  const logo = req.file ? req.file.filename : "";
  const description =
    req.body?.description !== undefined && req.body?.description !== null
      ? String(req.body.description).trim()
      : undefined;

  const existing = await findExistingBrandByNameCI(name);
  if (existing) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.CONFLICT,
      "Brand already exists",
      ERROR_CODES.RESOURCE_ALREADY_EXISTS
    );
  }

  const brand = new Brand({
    name,
    logo,
    ...(description !== undefined ? { description } : {}),
  });
  await brand.save();
  invalidateHomepageBundleCache();

  return sendSuccessResponse(
    res,
    HTTP_STATUS.CREATED,
    "✅ Brand created successfully",
    brand
  );
});

// ========== ✅ Seller: Add Brand (Name only, no logo) ==========
exports.addBrandSeller = asyncHandler(async (req, res) => {
  const rawName = req.body?.name;
  const name = normalizeBrandName(rawName);
  if (!name) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Brand name is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const existing = await findExistingBrandByNameCI(name);
  if (existing) {
    return sendSuccessResponse(
      res,
      HTTP_STATUS.OK,
      "✅ Brand already exists",
      existing
    );
  }

  try {
    const brand = new Brand({ name });
    await brand.save();
    invalidateHomepageBundleCache();
    return sendSuccessResponse(
      res,
      HTTP_STATUS.CREATED,
      "✅ Brand created successfully",
      brand
    );
  } catch (err) {
    // Handle race / unique index conflicts gracefully by re-fetching case-insensitively.
    if (err && (err.code === 11000 || String(err.message || "").toLowerCase().includes("duplicate"))) {
      const again = await findExistingBrandByNameCI(name);
      if (again) {
        return sendSuccessResponse(
          res,
          HTTP_STATUS.OK,
          "✅ Brand already exists",
          again
        );
      }
    }
    throw err;
  }
});

// ========== ✅ Get All Brands ==========
// Legacy: no page/limit → success wrapper with data array (unchanged).
// Paginated: page or limit → { brands, pagination }.
exports.getBrands = asyncHandler(async (req, res) => {
  const locale = req.query.locale;

  const applyLocale = async (brands) => {
    if (locale && locale !== "en") {
      return applyTranslations(brands, "Brand", locale, ["name", "description"]);
    }
    return brands;
  };

  if (brandListingService.isPaginatedMode(req.query)) {
    const { brands, pagination } = await brandListingService.listBrands(req.query);
    const localized = await applyLocale(brands);
    return res.status(HTTP_STATUS.OK).json({
      brands: localized,
      pagination,
    });
  }

  let brands = await brandListingService.listAllBrandsLegacy(req.query);
  brands = await applyLocale(brands);
  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Brands retrieved successfully",
    brands
  );
});

// ========== ✅ Update Brand ==========
exports.updateBrand = asyncHandler(async (req, res) => {
  const { name, isActive, description } = req.body;
  const brand = await Brand.findById(req.params.id);
  if (!brand) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.RESOURCE_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Delete old logo from R2 if exists and a new one is uploaded
  if (req.file) {
    if (brand.logo) {
      await deleteMediaObject(brand.logo);
    }
    // Handle R2 URLs (full URLs) vs local filenames
    brand.logo = req.file.filename;
  }

  if (name) brand.name = name;

  if (description !== undefined) {
    brand.description = String(description ?? "").trim();
  }

  if (isActive !== undefined) {
    // FormData sends strings; coerce safely.
    if (typeof isActive === "string") {
      const v = isActive.trim().toLowerCase();
      if (v === "true" || v === "1" || v === "yes" || v === "on") brand.isActive = true;
      else if (v === "false" || v === "0" || v === "no" || v === "off") brand.isActive = false;
    } else {
      brand.isActive = Boolean(isActive);
    }
  }

  await brand.save();
  invalidateHomepageBundleCache();

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Brand updated successfully",
    brand
  );
});

// ========== ✅ Delete Brand ==========
exports.deleteBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.RESOURCE_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Delete logo file from R2 if exists
  if (brand.logo) {
    await deleteMediaObject(brand.logo);
  }

  await brand.deleteOne();
  invalidateHomepageBundleCache();

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Brand deleted successfully"
  );
});
