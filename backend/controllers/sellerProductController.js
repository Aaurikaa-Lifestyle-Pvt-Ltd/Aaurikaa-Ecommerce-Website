// backend/controllers/sellerProductController.js

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const mongoose = require("mongoose");
const { Readable } = require("stream");
const Product = require("../models/Product");
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require("../utils/errorHandler");
const { deleteMediaObject } = require("../services/r2UploadService");
const { validateBulkDiscountConfig } = require("../utils/bulkDiscountCalculator");
const { validateProductRows } = require("../utils/bulkUploadValidator");
const { convertProductRows } = require("../utils/bulkUploadTypeConverter");
const { generateSku } = require("../utils/skuGenerator");
const {
  assertPublishable,
  checkPrimaryKeywordAvailability,
  enforcePublishSlugOnTransition,
  isDraftToPublishedTransition,
} = require("../utils/productPublishGuard");
const { formatProductsForExport } = require("../utils/productExportService");
const {
  validateProductWeightClass,
} = require("../utils/catalogShippingValidation");
const {
  normalizeProductReturnPolicyFields,
  assertSellerReturnPolicyReady,
} = require("../utils/returnPolicyResolver");
const {
  pickAssuranceWriteFields,
  stripFlatAssuranceAliases,
} = require("../utils/productAssuranceFields");
const Seller = require("../models/Seller");
const productListingService = require("../services/productListingService");
const {
  fillMissingVariantSkus,
  VariantSkuGenerationError,
} = require("../utils/variantSkuGeneration");
const {
  assertSellerPrimaryImmutable,
  assertValidPrimaryPath,
  normalizeAndValidateSecondaryCategories,
  resolveEffectivePrimaryPath,
  toIdString,
} = require("../utils/productCategoryValidation");
const { normalizeFeaturesForWrite } = require("../utils/keyFeatureNormalization");
const { mergePrimaryKeywordIntoSeo } = require("../utils/primaryKeywordValidation");


//
// 🛠️ Helper Functions
//
const safeParse = (val) => {
  try {
    // Handle null, undefined, empty string
    if (val === null || val === undefined || val === '') return [];

    // Handle empty array string
    if (val === '[]') return [];

    // If already an array, return it
    if (Array.isArray(val)) return val;

    // Handle string that looks like "[object Object]" - this is invalid
    if (typeof val === 'string' && val === '[object Object]') {
      console.warn('⚠️ Received "[object Object]" string, returning empty array');
      return [];
    }

    // Try to parse as JSON string
    if (typeof val === 'string') {
      const trimmed = val.trim();
      // Handle empty or whitespace-only strings
      if (!trimmed || trimmed === '[]') return [];

      const parsed = JSON.parse(trimmed);
      // Ensure we return an array
      return Array.isArray(parsed) ? parsed : [];
    }

    // For any other type, return empty array
    return [];
  } catch (error) {
    // Silent fail - return empty array
    return [];
  }
};

const safeParseObject = (val) => {
  try {
    // Handle null, undefined, empty string
    if (!val || val === '' || val === '{}') return {};

    // Handle "[object Object]" string - this is invalid
    if (typeof val === 'string' && val === '[object Object]') {
      console.warn('⚠️ Received "[object Object]" string, returning empty object');
      return {};
    }

    // If already an object (and not array), return it
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      return val;
    }

    // Try to parse as JSON string
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed || trimmed === '{}') return {};

      const parsed = JSON.parse(trimmed);
      // Ensure we return an object (not array)
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
    }

    // For any other type, return empty object
    return {};
  } catch (error) {
    // Silent fail - return empty object
    return {};
  }
};

const toBool = (val) => {
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    return val.toLowerCase() === 'true' || val === '1' || val === 'on';
  }
  if (typeof val === 'number') {
    return val === 1;
  }
  return false;
};

const safeArray = (val) => {
  if (!val || val === '') return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'string') {
    return val.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
};

const {
  normalizeProductTagsForWrite,
  hasTagsField,
} = require('../utils/productTags');

// Helper function to extract a single valid ObjectId from various input formats
const extractSingleObjectId = (value) => {
  if (!value) return null;

  // Handle arrays - take first element
  if (Array.isArray(value)) {
    value = value[0];
  }

  // Convert to string
  const strValue = String(value).trim();
  if (!strValue) return null;

  // Handle comma-separated values - take first one
  const firstValue = strValue.split(',')[0].trim();

  // Validate ObjectId format
  if (mongoose.Types.ObjectId.isValid(firstValue)) {
    return firstValue;
  }

  return null;
};

const parseBulkDiscount = (val) => {
  try {
    // Handle null, undefined, empty string
    if (!val || val === '' || val === '{}') {
      return {
        enabled: false,
        tiers: []
      };
    }

    // Handle "[object Object]" string - this is invalid JSON
    if (typeof val === 'string' && val === '[object Object]') {
      console.warn('⚠️ Received "[object Object]" string for bulkDiscount, returning default');
      return {
        enabled: false,
        tiers: []
      };
    }

    // If already an object (and not array), validate and return
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      return {
        enabled: Boolean(val.enabled),
        tiers: Array.isArray(val.tiers) ? val.tiers : []
      };
    }

    // Try to parse as JSON string
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed || trimmed === '{}') {
        return {
          enabled: false,
          tiers: []
        };
      }

      const parsed = JSON.parse(trimmed);
      return {
        enabled: Boolean(parsed?.enabled),
        tiers: Array.isArray(parsed?.tiers) ? parsed.tiers : []
      };
    }

    // Default fallback
    return {
      enabled: false,
      tiers: []
    };
  } catch (error) {
    console.error('Error parsing bulk discount:', error);
    return {
      enabled: false,
      tiers: []
    };
  }
};

// Local file deletion removed - now using R2 deletion

// Seller folder fixed
const getSellerFolder = () => "sellers";

//
// ➕ Add Product (Seller Only)
//
exports.addProduct = async (req, res) => {
  try {
    const body = req.body;
    const weightClassValidation = await validateProductWeightClass(body.weightClass, {
      required: true,
    });
    if (!weightClassValidation.valid) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        weightClassValidation.message,
        ERROR_CODES.VALIDATION_FAILED
      );
    }
    const normalizedWeightClass = weightClassValidation.value;

    const returnPolicyFields = normalizeProductReturnPolicyFields(body);
    if (!returnPolicyFields.valid) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        returnPolicyFields.message,
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    // 🛡️ Validate status - Sellers can only set "draft" or "published"
    if (body.status && !["draft", "published"].includes(body.status)) {
      return res.status(400).json({
        message: "❌ Invalid status. Sellers can only set status to 'draft' or 'published'."
      });
    }

    const intendedStatus = body.status || "published";
    if (intendedStatus === "published") {
      const sellerDoc = await Seller.findById(req.user._id || req.user.id)
        .select("returnAllowed returnWindowDays returnConditions")
        .lean();
      const policyReady = assertSellerReturnPolicyReady(sellerDoc);
      if (!policyReady.valid) {
        return sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          policyReady.message,
          ERROR_CODES.VALIDATION_FAILED
        );
      }
    }

    const folder = getSellerFolder();

    // 🛡️ Publish Guard (effective status: body.status || "published")
    try {
      await assertPublishable(body, "seller", body.id || body.draftId);
    } catch (guardError) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, guardError.message, ERROR_CODES.VALIDATION_FAILED);
    }

    // Handle R2 URLs (full URLs) vs local filenames
    const mainImage = (req.files?.mainImage?.[0]
      ? (req.files.mainImage[0].filename.startsWith('http')
        ? req.files.mainImage[0].filename
        : `${folder}/${req.files.mainImage[0].filename}`)
      : (typeof body.mainImage === 'string' ? body.mainImage : null));

    const galleryImagesFromFiles =
      req.files?.galleryImages?.map((file) =>
        file.filename.startsWith('http')
          ? file.filename
          : `${folder}/${file.filename}`
      ) || [];

    // Process gallery images from body (library selections)
    let galleryImagesFromBody = [];
    if (body.galleryImages) {
      if (Array.isArray(body.galleryImages)) {
        galleryImagesFromBody = body.galleryImages.filter(img => typeof img === 'string');
      } else if (typeof body.galleryImages === 'string') {
        galleryImagesFromBody = body.galleryImages.split(',').filter(img => img.startsWith('http'));
      }
    }

    const galleryImages = [...galleryImagesFromFiles, ...galleryImagesFromBody];

    const video = (req.files?.video?.[0]
      ? (req.files.video[0].filename.startsWith('http')
        ? req.files.video[0].filename
        : `${folder}/${req.files.video[0].filename}`)
      : (typeof body.video === 'string' ? body.video : null));

    // Support for Internal Media IDs (SRS §4.3.2)
    const mainImageId = extractSingleObjectId(body.mainImageId);
    const videoId = extractSingleObjectId(body.videoId);
    let galleryImageIds = [];
    if (body.galleryImageIds) {
      try {
        const parsed = typeof body.galleryImageIds === 'string' ? JSON.parse(body.galleryImageIds) : body.galleryImageIds;
        // Ensure it's an array and filter out invalid ObjectIds
        if (Array.isArray(parsed)) {
          galleryImageIds = parsed
            .map(id => extractSingleObjectId(id))
            .filter(id => id !== null);
        } else {
          // Single value - convert to array
          const singleId = extractSingleObjectId(parsed);
          if (singleId) galleryImageIds = [singleId];
        }
      } catch (e) {
        galleryImageIds = [];
      }
    }



    // Filter out empty strings for ObjectId fields
    const cleanBody = { ...body };
    if (!cleanBody.subcategory || cleanBody.subcategory === '') {
      delete cleanBody.subcategory;
    }
    if (!cleanBody.childCategory || cleanBody.childCategory === '') {
      delete cleanBody.childCategory;
    }
    if (!cleanBody.brand || cleanBody.brand === '') {
      delete cleanBody.brand;
    }
    delete cleanBody.returnPolicyMode;
    delete cleanBody.returnAllowed;
    delete cleanBody.returnWindowDays;
    delete cleanBody.warranty;
    delete cleanBody.manufacturerConditions;
    delete cleanBody.genuineProduct;
    stripFlatAssuranceAliases(cleanBody);
    delete cleanBody.weightClass;

    // Handle multer.any() array format for array fields
    // Multer may send arrays for fields that should be arrays
    const normalizeArrayField = (fieldName) => {
      const value = body[fieldName];
      if (Array.isArray(value) && value.length > 0) {
        // Filter out empty strings and get the last non-empty value if it's a string
        const nonEmpty = value.filter(v => v && v !== '');
        if (nonEmpty.length > 0) {
          // If all values are strings, try to parse the last one
          const lastValue = nonEmpty[nonEmpty.length - 1];
          if (typeof lastValue === 'string') {
            return lastValue;
          }
          // If it's already an array of objects, return as is
          return nonEmpty;
        }
        return '';
      }
      return value;
    };

    // Normalize array fields that might come from multer as arrays
    if (body.usageInstructions && Array.isArray(body.usageInstructions)) {
      body.usageInstructions = normalizeArrayField('usageInstructions');
    }
    if (body.variants && Array.isArray(body.variants)) {
      body.variants = normalizeArrayField('variants');
    }
    if (body.features && Array.isArray(body.features)) {
      body.features = normalizeArrayField('features');
    }
    if (body.qandas && Array.isArray(body.qandas)) {
      body.qandas = normalizeArrayField('qandas');
    }
    if (body.featuresContent && Array.isArray(body.featuresContent)) {
      body.featuresContent = normalizeArrayField('featuresContent');
    }
    if (body.usageSafetyContent && Array.isArray(body.usageSafetyContent)) {
      body.usageSafetyContent = normalizeArrayField('usageSafetyContent');
    }

    // Ensure these multipart fields never remain arrays in the spread `cleanBody`.
    cleanBody.featuresContent = typeof body.featuresContent === 'string' ? body.featuresContent : '';
    cleanBody.usageSafetyContent = typeof body.usageSafetyContent === 'string' ? body.usageSafetyContent : '';

    // Parse and validate bulk discount configuration
    const bulkDiscount = parseBulkDiscount(body.bulkDiscount);
    const regularPrice = Number(body.regularPrice) || 0;

    // Validate bulk discount configuration if enabled
    if (bulkDiscount.enabled) {
      const validation = validateBulkDiscountConfig(bulkDiscount, regularPrice);
      if (!validation.isValid) {
        return sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          "Invalid bulk discount configuration",
          ERROR_CODES.INVALID_INPUT,
          {
            errors: validation.errors,
            warnings: validation.warnings
          }
        );
      }
    }

    // Initialize variant media and SKU from body if provided
    let variantMedia = body.variantMedia !== undefined
      ? (body.variantMedia ? safeParseObject(body.variantMedia) : undefined)
      : undefined;

    let variantSku = body.variantSku !== undefined
      ? (body.variantSku ? safeParseObject(body.variantSku) : undefined)
      : undefined;

    // WS-1 / 1.6 — category path validation (create / draft finalize via addProduct)
    let validatedSecondaryCategories;
    try {
      await assertValidPrimaryPath(cleanBody);
      if (body.secondaryCategories !== undefined) {
        validatedSecondaryCategories = await normalizeAndValidateSecondaryCategories(
          body.secondaryCategories,
          resolveEffectivePrimaryPath(cleanBody)
        );
        cleanBody.secondaryCategories = validatedSecondaryCategories;
      } else {
        delete cleanBody.secondaryCategories;
      }
    } catch (categoryError) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        categoryError.message,
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    // Check if we are finalizing a draft
    const draftId = body.id || body.draftId;
    let product;
    let isPublishing = false;
    const newStatus = body.status || "published";

    if (draftId && mongoose.Types.ObjectId.isValid(draftId)) {
      product = await Product.findOne({ _id: draftId, ownerUserId: req.user._id });
    }

    if (product) {
      // WS-1 / 1.6 — seller primary immutability on draft-finalize / publish via addProduct
      try {
        assertSellerPrimaryImmutable(product, body);
      } catch (categoryError) {
        return sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          categoryError.message,
          ERROR_CODES.VALIDATION_FAILED
        );
      }

      // Preserve any already-established primary path fields (ignore body tampering)
      for (const field of ["category", "subcategory", "childCategory"]) {
        const existingId = toIdString(product[field]);
        if (existingId) {
          cleanBody[field] = existingId;
        }
      }

      // Update existing draft
      // Filter out empty strings for ObjectId fields is already done in cleanBody
      isPublishing = isDraftToPublishedTransition(product.status, newStatus);

      Object.assign(product, {
        ...cleanBody,
        returnPolicyMode: returnPolicyFields.returnPolicyMode,
        returnAllowed: returnPolicyFields.returnAllowed,
        returnWindowDays: returnPolicyFields.returnWindowDays,
        returnConditions: returnPolicyFields.returnConditions,
        ...pickAssuranceWriteFields(body),
        status: newStatus, // Transition from draft to requested status
        regularPrice,
        salePrice: Number(body.salePrice) || 0,
        stock: Number(body.stock) || 0,
        length: Number(body.length) || 0,
        width: Number(body.width) || 0,
        height: Number(body.height) || 0,
        weight: Number(body.weight) || 0,
        taxRate: Number(body.taxRate) || 0,
        weightClass: normalizedWeightClass,
        taxIncluded: toBool(body.taxIncluded),
        isFeatured: toBool(body.isFeatured),
        bulkDiscount,
        mainImage: mainImage || product.mainImage,
        mainImageId: mainImageId || product.mainImageId,
        galleryImages: galleryImages.length > 0 ? galleryImages : product.galleryImages,
        galleryImageIds: galleryImageIds.length > 0 ? galleryImageIds : product.galleryImageIds,
        video: video || product.video,
        videoId: videoId || product.videoId,
        variants: safeParse(body.variants),
        features: body.features === undefined ? product.features : normalizeFeaturesForWrite(body.features),
        qandas: safeParse(body.qandas),
        usageInstructions: body.usageInstructions === undefined ? product.usageInstructions : safeParse(body.usageInstructions),
        featuresContent: typeof body.featuresContent === 'string' ? body.featuresContent : '',
        usageSafetyContent: typeof body.usageSafetyContent === 'string' ? body.usageSafetyContent : '',
        upsellSkus: safeArray(body.upsellSkus),
        crossSellSkus: safeArray(body.crossSellSkus),
        boughtTogetherSkus: safeArray(body.boughtTogetherSkus),
        tags: normalizeProductTagsForWrite(body.tags),
        sellerShop: extractSingleObjectId(body.sellerShop) || product.sellerShop,
        seller: req.user._id || extractSingleObjectId(body.sellerId) || product.seller,
        variantPricing: body.variantPricing ? safeParseObject(body.variantPricing) : product.variantPricing,
        variantStock: body.variantStock ? safeParseObject(body.variantStock) : product.variantStock,
        variantMedia: variantMedia || product.variantMedia,
        variantSku: variantSku || product.variantSku,
        // Only set approvalStatus to "pending" when publishing (not for drafts)
        approvalStatus: isPublishing ? "pending" : (newStatus === "draft" ? undefined : product.approvalStatus)
      });
    } else {
      // Create new product
      isPublishing = isDraftToPublishedTransition(undefined, newStatus);

      product = new Product({
        ...cleanBody,
        returnPolicyMode: returnPolicyFields.returnPolicyMode,
        returnAllowed: returnPolicyFields.returnAllowed,
        returnWindowDays: returnPolicyFields.returnWindowDays,
        returnConditions: returnPolicyFields.returnConditions,
        ...pickAssuranceWriteFields(body),
        regularPrice,
        salePrice: Number(body.salePrice) || 0,
        stock: Number(body.stock) || 0,
        length: Number(body.length) || 0,
        width: Number(body.width) || 0,
        height: Number(body.height) || 0,
        weight: Number(body.weight) || 0,
        taxRate: Number(body.taxRate) || 0,
        weightClass: normalizedWeightClass,
        taxIncluded: toBool(body.taxIncluded),
        isFeatured: toBool(body.isFeatured),
        bulkDiscount,
        mainImage,
        mainImageId,
        galleryImages,
        galleryImageIds,
        video,
        videoId,
        variants: safeParse(body.variants),
        features: body.features === undefined ? [] : normalizeFeaturesForWrite(body.features),
        qandas: safeParse(body.qandas),
        usageInstructions: body.usageInstructions === undefined ? [] : safeParse(body.usageInstructions),
        featuresContent: typeof body.featuresContent === 'string' ? body.featuresContent : '',
        usageSafetyContent: typeof body.usageSafetyContent === 'string' ? body.usageSafetyContent : '',
        upsellSkus: safeArray(body.upsellSkus),
        crossSellSkus: safeArray(body.crossSellSkus),
        boughtTogetherSkus: safeArray(body.boughtTogetherSkus),
        tags: normalizeProductTagsForWrite(body.tags),
        sellerShop: extractSingleObjectId(body.sellerShop) || req.user._id,
        seller: req.user._id || extractSingleObjectId(body.sellerId) || null,
        ownerUserId: req.user._id,
        variantPricing: body.variantPricing ? safeParseObject(body.variantPricing) : undefined,
        variantStock: body.variantStock ? safeParseObject(body.variantStock) : undefined,
        variantMedia,
        variantSku,
        status: newStatus,
        // Only set approvalStatus to "pending" when publishing (not for drafts)
        approvalStatus: isPublishing ? "pending" : undefined

      });
    }

    // Auto-generate base SKU if missing
    if (!product.sku || product.sku.trim() === '') {
      const seller = await mongoose.model("Seller").findById(product.seller);
      const category = await mongoose.model("Category").findById(product.category);
      product.sku = await generateSku({
        product: product,
        category: category,
        seller: seller
      });
    }

    // Process variant media files if any
    if (req.files) {
      const variantMediaFiles = {};
      Object.keys(req.files).forEach(key => {
        const match = key.match(/^variantMedia-(.+?)-(mainImage|video|galleryImages)$/);
        if (match) {
          const [, variantKey, field] = match;
          if (!variantMediaFiles[variantKey]) variantMediaFiles[variantKey] = {};

          const files = Array.isArray(req.files[key]) ? req.files[key] : [req.files[key]];
          if (field === 'galleryImages') {
            variantMediaFiles[variantKey][field] = files.map(file =>
              file.filename.startsWith('http') ? file.filename : `${folder}/${file.filename}`
            );
          } else {
            const file = files[0];
            variantMediaFiles[variantKey][field] = file.filename.startsWith('http') ? file.filename : `${folder}/${file.filename}`;
          }
        }
      });

      if (Object.keys(variantMediaFiles).length > 0) {
        if (!product.variantMedia) product.variantMedia = {};
        Object.keys(variantMediaFiles).forEach(key => {
          if (!product.variantMedia[key]) product.variantMedia[key] = {};
          product.variantMedia[key] = { ...product.variantMedia[key], ...variantMediaFiles[key] };
        });
        product.markModified("variantMedia");
      }
    }

    // Auto-generate missing variant SKUs
    const variants = product.variants;
    if (variants && variants.length > 0) {
      const seller = await mongoose.model("Seller").findById(product.seller);
      const category = await mongoose.model("Category").findById(product.category);

      try {
        const { variantSku: nextVariantSku, updated } = await fillMissingVariantSkus({
          product,
          variants,
          variantSku: product.variantSku || {},
          baseSku: product.sku,
          category,
          seller,
        });
        if (updated) {
          product.variantSku = nextVariantSku;
          product.markModified("variantSku");
        }
      } catch (err) {
        if (err instanceof VariantSkuGenerationError) {
          return sendErrorResponse(
            res,
            HTTP_STATUS.BAD_REQUEST,
            err.message,
            ERROR_CODES.VALIDATION_FAILED
          );
        }
        throw err;
      }
    }

    try {
      product.slug = await enforcePublishSlugOnTransition({
        isDraftToPublished: isPublishing,
        name: body.name || product.name,
        currentSlug: product.slug,
        productId: product._id,
        actor: "seller",
      });
    } catch (guardError) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        guardError.message,
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    await product.save();
    sendSuccessResponse(res, HTTP_STATUS.CREATED, `✅ Product ${draftId ? 'updated and published' : 'added'} successfully`, { product });
  } catch (err) {
    console.error("❌ Add product error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "❌ Failed to add product", ERROR_CODES.INTERNAL_ERROR, { error: err.message });
  }
};

// 💾 Auto-Save Product (Seller Draft)
exports.autoSaveProduct = async (req, res) => {
  try {
    const { id, ...updateData } = req.body;
    updateData.status = "draft";
    updateData.ownerUserId = req.user._id;

    // Explicitly set approvalStatus to undefined for drafts (should not go to admin approval)
    // Only published products should require approval
    updateData.approvalStatus = undefined;

    // WS-1 regression guard (1.8 / Phase 4): map flat primaryKeyword → seo.primaryKeyword
    mergePrimaryKeywordIntoSeo(updateData);

    // Ensure seller field is set
    if (!updateData.seller) {
      updateData.seller = req.user._id;
    }
    if (!updateData.sellerShop) {
      updateData.sellerShop = req.user._id;
    }

    // Sanitize updateData to prevent validation errors during draft save
    // weightClass (Shipping Slab) is nullable on drafts; empty string must not be cast to ObjectId
    const objectIdFields = ["brand", "seller", "admin", "category", "subcategory", "childCategory", "sellerShop", "weightClass"];
    objectIdFields.forEach(field => {
      if (updateData[field] === "" || updateData[field] === null || updateData[field] === "null" || updateData[field] === "undefined") {
        delete updateData[field];
      }
    });

    if (!updateData.name || updateData.name.trim() === "") {
      // If updating an existing product, don't revert to "Untitled Draft" if name is cleared
      if (id) {
        delete updateData.name;
      } else {
        updateData.name = "Untitled Draft";
      }
    }

    if (updateData.regularPrice === undefined || updateData.regularPrice === null || updateData.regularPrice === "" || isNaN(Number(updateData.regularPrice))) {
      updateData.regularPrice = 0;
    }

    // Process array fields - autosave receives JSON, so these may already be arrays or JSON strings
    // Handle usageInstructions
    if (updateData.usageInstructions !== undefined) {
      if (typeof updateData.usageInstructions === 'string') {
        try {
          updateData.usageInstructions = updateData.usageInstructions === '' ? [] : JSON.parse(updateData.usageInstructions);
        } catch {
          updateData.usageInstructions = [];
        }
      } else if (!Array.isArray(updateData.usageInstructions)) {
        updateData.usageInstructions = [];
      }
      // Filter out empty usage instructions
      if (Array.isArray(updateData.usageInstructions)) {
        updateData.usageInstructions = updateData.usageInstructions.filter(ui =>
          ui && (ui.title || ui.instruction)
        );
      }
    }

    // Handle features (trim/filter; retain catalogue code + multi-value; no key rewrite)
    if (updateData.features !== undefined) {
      updateData.features = normalizeFeaturesForWrite(updateData.features);
    }

    // Handle qandas
    if (updateData.qandas !== undefined) {
      if (typeof updateData.qandas === 'string') {
        try {
          updateData.qandas = updateData.qandas === '' ? [] : JSON.parse(updateData.qandas);
        } catch {
          updateData.qandas = [];
        }
      } else if (!Array.isArray(updateData.qandas)) {
        updateData.qandas = [];
      }
    }

    // Handle variants
    if (updateData.variants !== undefined) {
      if (typeof updateData.variants === 'string') {
        try {
          updateData.variants = updateData.variants === '' ? [] : JSON.parse(updateData.variants);
        } catch {
          updateData.variants = [];
        }
      } else if (!Array.isArray(updateData.variants)) {
        updateData.variants = [];
      }
    }

    // Handle bulkDiscount
    if (updateData.bulkDiscount !== undefined) {
      if (typeof updateData.bulkDiscount === 'string') {
        try {
          updateData.bulkDiscount = updateData.bulkDiscount === '' ? { enabled: false, tiers: [] } : JSON.parse(updateData.bulkDiscount);
        } catch {
          updateData.bulkDiscount = { enabled: false, tiers: [] };
        }
      } else if (!updateData.bulkDiscount || typeof updateData.bulkDiscount !== 'object') {
        updateData.bulkDiscount = { enabled: false, tiers: [] };
      }
    }

    // Handle variant-level data
    if (updateData.variantPricing !== undefined) {
      if (typeof updateData.variantPricing === 'string') {
        try {
          updateData.variantPricing = updateData.variantPricing === '' ? {} : JSON.parse(updateData.variantPricing);
        } catch {
          updateData.variantPricing = {};
        }
      } else if (!updateData.variantPricing || typeof updateData.variantPricing !== 'object' || Array.isArray(updateData.variantPricing)) {
        updateData.variantPricing = {};
      }
    }

    if (updateData.variantStock !== undefined) {
      if (typeof updateData.variantStock === 'string') {
        try {
          updateData.variantStock = updateData.variantStock === '' ? {} : JSON.parse(updateData.variantStock);
        } catch {
          updateData.variantStock = {};
        }
      } else if (!updateData.variantStock || typeof updateData.variantStock !== 'object' || Array.isArray(updateData.variantStock)) {
        updateData.variantStock = {};
      }
    }

    if (updateData.variantMedia !== undefined) {
      if (typeof updateData.variantMedia === 'string') {
        try {
          updateData.variantMedia = updateData.variantMedia === '' ? {} : JSON.parse(updateData.variantMedia);
        } catch {
          updateData.variantMedia = {};
        }
      } else if (!updateData.variantMedia || typeof updateData.variantMedia !== 'object' || Array.isArray(updateData.variantMedia)) {
        updateData.variantMedia = {};
      }
    }

    if (updateData.variantSku !== undefined) {
      if (typeof updateData.variantSku === 'string') {
        try {
          updateData.variantSku = updateData.variantSku === '' ? {} : JSON.parse(updateData.variantSku);
        } catch {
          updateData.variantSku = {};
        }
      } else if (!updateData.variantSku || typeof updateData.variantSku !== 'object' || Array.isArray(updateData.variantSku)) {
        updateData.variantSku = {};
      }
    }

    if (updateData.tags !== undefined) {
      updateData.tags = normalizeProductTagsForWrite(updateData.tags);
    }

    const assuranceFields = pickAssuranceWriteFields(updateData);
    stripFlatAssuranceAliases(updateData);
    delete updateData.warranty;
    delete updateData.manufacturerConditions;
    delete updateData.genuineProduct;
    Object.assign(updateData, assuranceFields);

    // Handle main product media (URLs from library selections only - files handled in final save)
    if (updateData.mainImage !== undefined) {
      if (typeof updateData.mainImage === 'string' && updateData.mainImage.trim() !== '') {
        // Keep as-is (already URL)
      } else if (updateData.mainImage === null || updateData.mainImage === '') {
        updateData.mainImage = null; // Explicitly clear
      } else {
        // File object or invalid - remove from updateData to preserve existing
        delete updateData.mainImage;
      }
    }

    if (updateData.galleryImages !== undefined) {
      if (Array.isArray(updateData.galleryImages) && updateData.galleryImages.length > 0) {
        // Filter to only keep string URLs (not File objects)
        updateData.galleryImages = updateData.galleryImages.filter(img => typeof img === 'string');
      } else if (updateData.galleryImages === null || updateData.galleryImages === '') {
        updateData.galleryImages = []; // Explicitly clear
      } else {
        // Invalid - remove from updateData to preserve existing
        delete updateData.galleryImages;
      }
    }

    if (updateData.video !== undefined) {
      if (typeof updateData.video === 'string' && updateData.video.trim() !== '') {
        // Keep as-is (already URL)
      } else if (updateData.video === null || updateData.video === '') {
        updateData.video = null; // Explicitly clear
      } else {
        // File object or invalid - remove from updateData to preserve existing
        delete updateData.video;
      }
    }

    // Handle media IDs (preserve if valid, remove if invalid)
    if (updateData.mainImageId !== undefined) {
      if (!updateData.mainImageId || updateData.mainImageId === '') {
        delete updateData.mainImageId; // Don't clear, preserve existing
      }
    }

    if (updateData.galleryImageIds !== undefined) {
      if (!Array.isArray(updateData.galleryImageIds) || updateData.galleryImageIds.length === 0) {
        delete updateData.galleryImageIds; // Don't clear, preserve existing
      }
    }

    if (updateData.videoId !== undefined) {
      if (!updateData.videoId || updateData.videoId === '') {
        delete updateData.videoId; // Don't clear, preserve existing
      }
    }

    // Auto-generate SKU for draft if missing
    if (!updateData.sku || updateData.sku.trim() === '') {
      const sellerModel = mongoose.model("Seller");
      const categoryModel = mongoose.model("Category");

      // For seller, we can use req.user (which is the seller) or look up by ID if needed (but req.user is safer)
      // Note: req.user in seller controller is the Seller document or has _id
      const categoryId = updateData.category;

      const seller = await sellerModel.findById(req.user._id);
      const category = categoryId ? await categoryModel.findById(categoryId) : null;

      updateData.sku = await generateSku({
        product: updateData,
        category: category,
        seller: seller
      });
    }

    let product;
    if (id) {
      const existingProduct = await Product.findOne({
        _id: id,
        ownerUserId: req.user._id
      });

      if (existingProduct && existingProduct.status !== "draft") {
        return res.status(409).json({
          success: false,
          message: "Cannot auto-save: product is not a draft",
          product: existingProduct,
        });
      }

      if (existingProduct) {
        // WS-1 / 1.6 — validate secondary paths against effective primary
        if (updateData.secondaryCategories !== undefined) {
          try {
            updateData.secondaryCategories = await normalizeAndValidateSecondaryCategories(
              updateData.secondaryCategories,
              resolveEffectivePrimaryPath(updateData, existingProduct)
            );
          } catch (categoryError) {
            return sendErrorResponse(
              res,
              HTTP_STATUS.BAD_REQUEST,
              categoryError.message,
              ERROR_CODES.VALIDATION_FAILED
            );
          }
        }

        const { approvalStatus, ...updateQuery } = updateData;

        product = await Product.findOneAndUpdate(
          { _id: id, ownerUserId: req.user._id, status: "draft" },
          {
            $set: updateQuery,
            $unset: { approvalStatus: "" }
          },
          { new: true, upsert: false }
        );
      }
    }

    if (!product) {
      // Create new draft if no ID provided or if ID not found/not owned by user
      if (updateData.secondaryCategories !== undefined) {
        try {
          updateData.secondaryCategories = await normalizeAndValidateSecondaryCategories(
            updateData.secondaryCategories,
            resolveEffectivePrimaryPath(updateData)
          );
        } catch (categoryError) {
          return sendErrorResponse(
            res,
            HTTP_STATUS.BAD_REQUEST,
            categoryError.message,
            ERROR_CODES.VALIDATION_FAILED
          );
        }
      }
      product = new Product(updateData);
      await product.save();
    }

    res.json({ message: "✅ Draft auto-saved", product });
  } catch (err) {
    console.error("❌ Auto-save error:", err);
    res.status(500).json({ message: "❌ Failed to auto-save draft" });
  }
};

// 📄 Get Latest Draft (Seller)
exports.getLatestDraft = async (req, res) => {
  try {
    const draft = await Product.findOne({
      ownerUserId: req.user._id,
      status: "draft"
    }).sort({ updatedAt: -1 })
      .populate("category subcategory childCategory brand", "name");

    res.json({ draft });
  } catch (err) {
    console.error("❌ Latest draft fetch error:", err);
    res.status(500).json({ message: "❌ Failed to fetch latest draft" });
  }
};


//
// 📦 Get Seller's Products
// Legacy: no page/limit → { products }. Paginated: page or limit → { products, pagination, tabCounts }.
//
exports.getMyProducts = async (req, res) => {
  try {
    const baseFilter = productListingService.buildSellerBaseFilter(req.user._id);

    if (!productListingService.isPaginatedMode(req.query)) {
      const products = await productListingService.listAllProductsLegacy({
        baseFilter,
        populate: productListingService.SELLER_POPULATE,
      });
      return sendSuccessResponse(res, HTTP_STATUS.OK, "Products retrieved successfully", {
        products,
      });
    }

    const { products, pagination, tabCounts } =
      await productListingService.listProducts({
        baseFilter,
        query: req.query,
        populate: productListingService.SELLER_POPULATE,
        isAdmin: false,
      });

    return sendSuccessResponse(res, HTTP_STATUS.OK, "Products retrieved successfully", {
      products,
      pagination,
      tabCounts,
    });
  } catch (err) {
    console.error("❌ Fetch seller products error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to fetch products", ERROR_CODES.INTERNAL_ERROR);
  }
};

//
// 🔍 Primary Keyword Availability (Seller — advisory)
//
exports.checkPrimaryKeywordAvailability = async (req, res) => {
  try {
    const keyword = req.query.keyword;
    const excludeProductId = req.query.excludeProductId;

    if (excludeProductId && !mongoose.Types.ObjectId.isValid(excludeProductId)) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Invalid product ID",
        ERROR_CODES.INVALID_INPUT
      );
    }

    const { available } = await checkPrimaryKeywordAvailability(
      keyword,
      excludeProductId || null
    );

    return sendSuccessResponse(
      res,
      HTTP_STATUS.OK,
      "Primary keyword uniqueness is not required",
      {
        available,
        keyword: keyword ?? "",
      }
    );
  } catch (err) {
    console.error("❌ Primary keyword availability error:", err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to check primary keyword availability",
      ERROR_CODES.INTERNAL_ERROR,
      { error: err.message }
    );
  }
};

//
// 🔍 Get Product by ID (Seller)
//
exports.getProductById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid product ID", ERROR_CODES.INVALID_INPUT);
    }

    const product = await Product.findOne({
      _id: req.params.id,
      seller: req.user._id,
    }).populate("category subcategory childCategory brand", "name")
      .populate("weightClass", "name");

    if (!product) return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Product not found", ERROR_CODES.RESOURCE_NOT_FOUND);

    sendSuccessResponse(res, HTTP_STATUS.OK, "Product retrieved successfully", { product });
  } catch (err) {
    console.error("❌ Get product error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Server error", ERROR_CODES.INTERNAL_ERROR, { error: err.message });
  }
};

//
// 📦 Get All Products (Seller’s products only or all?)
//
exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .populate("category subcategory childCategory brand", "name")
      .sort({ createdAt: -1 });

    res.status(200).json(products);
  } catch (err) {
    console.error("❌ Fetch all products error:", err);
    res.status(500).json({ message: "❌ Failed to fetch all products" });
  }
};


//
// ✏️ Update Product (Seller)
//
exports.updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const body = req.body;
    const weightClassValidation = await validateProductWeightClass(body.weightClass, {
      required: true,
    });
    if (!weightClassValidation.valid) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        weightClassValidation.message,
        ERROR_CODES.VALIDATION_FAILED
      );
    }
    const normalizedWeightClass = weightClassValidation.value;

    const returnPolicyFields = normalizeProductReturnPolicyFields(body);
    if (!returnPolicyFields.valid) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        returnPolicyFields.message,
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    // 🛡️ Validate status - Sellers can only set "draft" or "published"
    if (body.status && !["draft", "published"].includes(body.status)) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "❌ Invalid status. Sellers can only set status to 'draft' or 'published'.",
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    const willPublish = body.status === "published";
    // Early policy gate when explicitly publishing
    if (willPublish) {
      const sellerDoc = await Seller.findById(req.user._id || req.user.id)
        .select("returnAllowed returnWindowDays returnConditions")
        .lean();
      const policyReady = assertSellerReturnPolicyReady(sellerDoc);
      if (!policyReady.valid) {
        return sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          policyReady.message,
          ERROR_CODES.VALIDATION_FAILED
        );
      }
    }

    const existingProduct = await Product.findOne({
      _id: productId,
      seller: req.user._id,
    });
    if (!existingProduct)
      return res.status(404).json({ message: "Product not found" });

    // WS-1 / 1.6 — seller primary category immutability (server-side)
    try {
      assertSellerPrimaryImmutable(existingProduct, body);
    } catch (categoryError) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        categoryError.message,
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    // 🛡️ Publish Guard (effective persisted status)
    try {
      await assertPublishable(body, "seller", productId, existingProduct.status);
    } catch (guardError) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, guardError.message, ERROR_CODES.VALIDATION_FAILED);
    }

    const folder = getSellerFolder();

    const newMainImage = (req.files?.mainImage?.[0]
      ? (req.files.mainImage[0].filename.startsWith('http')
        ? req.files.mainImage[0].filename
        : `${folder}/${req.files.mainImage[0].filename}`)
      : (typeof body.mainImage === 'string' ? body.mainImage : null));

    const newGalleryImagesFromFiles =
      req.files?.galleryImages?.map((file) =>
        file.filename.startsWith('http')
          ? file.filename
          : `${folder}/${file.filename}`
      ) || [];

    // Process gallery images from body (library selections)
    let newGalleryImagesFromBody = [];
    if (body.galleryImages) {
      if (Array.isArray(body.galleryImages)) {
        newGalleryImagesFromBody = body.galleryImages.filter(img => typeof img === 'string');
      } else if (typeof body.galleryImages === 'string') {
        newGalleryImagesFromBody = body.galleryImages.split(',').filter(img => img.startsWith('http'));
      }
    }

    const newGalleryImages = [...newGalleryImagesFromFiles, ...newGalleryImagesFromBody];

    const newVideo = (req.files?.video?.[0]
      ? (req.files.video[0].filename.startsWith('http')
        ? req.files.video[0].filename
        : `${folder}/${req.files.video[0].filename}`)
      : (typeof body.video === 'string' ? body.video : null));


    // Delete old files from R2 when new files are uploaded
    // Only delete if actually replaced (not just preserved)
    if (newMainImage && existingProduct.mainImage && newMainImage !== existingProduct.mainImage) {
      await deleteMediaObject(existingProduct.mainImage);
    }
    if (newGalleryImages?.length && existingProduct.galleryImages?.length) {
      // Only delete images that are no longer in the new list
      const imagesToDelete = existingProduct.galleryImages.filter(
        existingImg => !newGalleryImages.some(newImg => {
          // Compare normalized URLs (handle folder prefixes and full URLs)
          const normalizedExisting = existingImg.startsWith('http')
            ? existingImg
            : existingImg.replace(/^(admin|sellers)\//, '');
          const normalizedNew = newImg.startsWith('http')
            ? newImg
            : newImg.replace(/^(admin|sellers)\//, '');
          return normalizedExisting === normalizedNew || existingImg === newImg;
        })
      );
      for (const img of imagesToDelete) {
        await deleteMediaObject(img);
      }
    }
    if (newVideo && existingProduct.video && newVideo !== existingProduct.video) {
      await deleteMediaObject(existingProduct.video);
    }

    // Filter out empty strings for ObjectId fields and array fields
    const cleanBody = { ...body };
    if (!cleanBody.subcategory || cleanBody.subcategory === '') {
      delete cleanBody.subcategory;
    }
    if (!cleanBody.childCategory || cleanBody.childCategory === '') {
      delete cleanBody.childCategory;
    }
    if (!cleanBody.brand || cleanBody.brand === '') {
      delete cleanBody.brand;
    }

    // Remove array fields from cleanBody to prevent them from being overridden
    delete cleanBody.variants;
    delete cleanBody.features;
    delete cleanBody.qandas;
    delete cleanBody.upsellSkus;
    delete cleanBody.crossSellSkus;
    delete cleanBody.boughtTogetherSkus;
    delete cleanBody.reviews; // Remove reviews to prevent timestamp issues
    delete cleanBody.galleryImages; // Remove galleryImages to prevent issues
    delete cleanBody.tags; // Remove tags to prevent issues
    delete cleanBody.bulkDiscount; // Remove bulkDiscount to handle separately
    delete cleanBody.sku;          // Phase 4: SKU is read-only for sellers
    delete cleanBody.returnPolicyMode;
    delete cleanBody.returnAllowed;
    delete cleanBody.returnWindowDays;
    delete cleanBody.warranty;
    delete cleanBody.manufacturerConditions;
    delete cleanBody.genuineProduct;
    stripFlatAssuranceAliases(cleanBody);
    delete cleanBody.weightClass;
    // Seller cannot mutate primary path — drop from payload; persisted values stay
    delete cleanBody.category;
    delete cleanBody.subcategory;
    delete cleanBody.childCategory;
    delete cleanBody.secondaryCategories;

    // Handle multer.any() array format for array fields
    // Multer may send arrays for fields that should be arrays
    const normalizeArrayField = (fieldName) => {
      const value = body[fieldName];
      if (Array.isArray(value) && value.length > 0) {
        // Filter out empty strings and get the last non-empty value if it's a string
        const nonEmpty = value.filter(v => v && v !== '');
        if (nonEmpty.length > 0) {
          // If all values are strings, try to parse the last one
          const lastValue = nonEmpty[nonEmpty.length - 1];
          if (typeof lastValue === 'string') {
            return lastValue;
          }
          // If it's already an array of objects, return as is
          return nonEmpty;
        }
        return '';
      }
      return value;
    };

    // Normalize array fields that might come from multer as arrays
    if (body.usageInstructions && Array.isArray(body.usageInstructions)) {
      body.usageInstructions = normalizeArrayField('usageInstructions');
    }
    if (body.variants && Array.isArray(body.variants)) {
      body.variants = normalizeArrayField('variants');
    }
    if (body.features && Array.isArray(body.features)) {
      body.features = normalizeArrayField('features');
    }
    if (body.qandas && Array.isArray(body.qandas)) {
      body.qandas = normalizeArrayField('qandas');
    }

    // Parse and validate bulk discount configuration
    const bulkDiscount = parseBulkDiscount(body.bulkDiscount);
    const regularPrice = Number(body.regularPrice) || existingProduct.regularPrice;

    // Validate bulk discount configuration if enabled
    if (bulkDiscount.enabled) {
      const validation = validateBulkDiscountConfig(bulkDiscount, regularPrice);
      if (!validation.isValid) {
        return sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          "Invalid bulk discount configuration",
          ERROR_CODES.INVALID_INPUT,
          {
            errors: validation.errors,
            warnings: validation.warnings
          }
        );
      }
    }

    let validatedSecondaryCategories;
    if (body.secondaryCategories !== undefined) {
      try {
        validatedSecondaryCategories = await normalizeAndValidateSecondaryCategories(
          body.secondaryCategories,
          existingProduct
        );
      } catch (categoryError) {
        return sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          categoryError.message,
          ERROR_CODES.VALIDATION_FAILED
        );
      }
    }

    const updatedFields = {
      ...cleanBody,
      regularPrice,
      salePrice: Number(body.salePrice) || 0,
      stock: Number(body.stock) || 0,
      length: Number(body.length) || 0,
      width: Number(body.width) || 0,
      height: Number(body.height) || 0,
      weight: Number(body.weight) || 0,
      taxRate: Number(body.taxRate) || 0,
      weightClass: normalizedWeightClass,
      returnPolicyMode: returnPolicyFields.returnPolicyMode,
      returnAllowed: returnPolicyFields.returnAllowed,
      returnWindowDays: returnPolicyFields.returnWindowDays,
      returnConditions: returnPolicyFields.returnConditions,
      ...pickAssuranceWriteFields(body),
      taxIncluded: toBool(body.taxIncluded),
      isFeatured: toBool(body.isFeatured),
      bulkDiscount, // Add bulk discount configuration
      variants: safeParse(body.variants),
      features: normalizeFeaturesForWrite(body.features),
      qandas: safeParse(body.qandas),
      usageInstructions: safeParse(body.usageInstructions),
      ...(validatedSecondaryCategories !== undefined
        ? { secondaryCategories: validatedSecondaryCategories }
        : {}),

      // Internal Media IDs
      mainImageId: extractSingleObjectId(body.mainImageId) || existingProduct.mainImageId,
      videoId: extractSingleObjectId(body.videoId) || existingProduct.videoId,
      galleryImageIds: (() => {
        if (!body.galleryImageIds) return existingProduct.galleryImageIds;
        try {
          const parsed = typeof body.galleryImageIds === 'string' ? JSON.parse(body.galleryImageIds) : body.galleryImageIds;
          if (Array.isArray(parsed)) {
            const validIds = parsed
              .map(id => extractSingleObjectId(id))
              .filter(id => id !== null);
            return validIds.length > 0 ? validIds : existingProduct.galleryImageIds;
          } else {
            const singleId = extractSingleObjectId(parsed);
            return singleId ? [singleId] : existingProduct.galleryImageIds;
          }
        } catch (e) {
          return existingProduct.galleryImageIds;
        }
      })(),
      upsellSkus: safeArray(body.upsellSkus),
      crossSellSkus: safeArray(body.crossSellSkus),
      boughtTogetherSkus: safeArray(body.boughtTogetherSkus),
      tags: hasTagsField(body)
        ? normalizeProductTagsForWrite(body.tags)
        : existingProduct.tags,
      sellerShop: extractSingleObjectId(body.sellerShop) || existingProduct.sellerShop,
    };

    // Process variant media files if any (for seller update)
    let variantMedia = body.variantMedia !== undefined
      ? (body.variantMedia ? safeParseObject(body.variantMedia) : undefined)
      : undefined;

    if (req.files) {
      const variantMediaFiles = {};
      Object.keys(req.files).forEach(key => {
        // Match pattern: variantMedia-{variantKey}-{field}
        const match = key.match(/^variantMedia-(.+?)-(mainImage|video|galleryImages)$/);
        if (match) {
          const [, variantKey, field] = match;
          if (!variantMediaFiles[variantKey]) {
            variantMediaFiles[variantKey] = {};
          }

          const files = Array.isArray(req.files[key]) ? req.files[key] : [req.files[key]];
          if (field === 'galleryImages') {
            variantMediaFiles[variantKey][field] = files.map(file =>
              file.filename.startsWith('http')
                ? file.filename
                : `${folder}/${file.filename}`
            );
          } else {
            const file = files[0];
            variantMediaFiles[variantKey][field] = file.filename.startsWith('http')
              ? file.filename
              : `${folder}/${file.filename}`;
          }
        }
      });

      if (Object.keys(variantMediaFiles).length > 0) {
        if (!variantMedia) variantMedia = {};
        Object.keys(variantMediaFiles).forEach(key => {
          if (!variantMedia[key]) variantMedia[key] = {};
          variantMedia[key] = { ...variantMedia[key], ...variantMediaFiles[key] };
        });
      }
    }

    // Parse and validate variant SKU
    const variantSku = body.variantSku !== undefined
      ? (body.variantSku ? safeParseObject(body.variantSku) : undefined)
      : undefined;
    const variants = safeParse(body.variants);

    // Validate variant SKU if variants exist
    if (variants && variants.length > 0 && variantSku) {
      const { generateVariantCombinations, normalizeVariantCombination } = require('../utils/variantUtils');
      const allCombinations = generateVariantCombinations(variants);
      const missingSkus = [];

      allCombinations.forEach(combo => {
        const key = normalizeVariantCombination(combo);
        if (key && !variantSku[key]) {
          missingSkus.push(key);
        }
      });


      // Validate SKU uniqueness within this product
      const skuValues = Object.values(variantSku).filter(sku => sku && sku.trim() !== '');
      const duplicateSkus = skuValues.filter((sku, index) => skuValues.indexOf(sku) !== index);
      if (duplicateSkus.length > 0) {
        return sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          `Duplicate SKUs found within this product. Each variant must have a unique SKU. Duplicates: ${[...new Set(duplicateSkus)].join(', ')}`,
          ERROR_CODES.VALIDATION_FAILED
        );
      }

      // Check uniqueness across all products in database (excluding current product)
      for (const skuValue of skuValues) {
        const existingProduct = await Product.findOne({
          _id: { $ne: productId },
          $or: [
            { sku: skuValue },
            { 'variantSku': { $type: 'object' }, [`variantSku.${Object.keys(variantSku).find(k => variantSku[k] === skuValue)}`]: skuValue }
          ]
        });

        if (existingProduct) {
          return sendErrorResponse(
            res,
            HTTP_STATUS.BAD_REQUEST,
            `SKU "${skuValue}" already exists in another product. Each variant SKU must be unique across all products.`,
            ERROR_CODES.VALIDATION_FAILED
          );
        }
      }
    }

    // Add variant data to updatedFields
    if (body.variantPricing !== undefined) {
      updatedFields.variantPricing = body.variantPricing ? safeParseObject(body.variantPricing) : undefined;
    }
    if (body.variantStock !== undefined) {
      updatedFields.variantStock = body.variantStock ? safeParseObject(body.variantStock) : undefined;
    }
    if (variantMedia !== undefined) {
      updatedFields.variantMedia = variantMedia;
    }
    if (variantSku !== undefined) {
      updatedFields.variantSku = variantSku;
    }

    // Additional safety check for any remaining string values in array fields
    if (updatedFields.variants === '') updatedFields.variants = [];
    if (updatedFields.features === '') updatedFields.features = [];
    if (updatedFields.qandas === '') updatedFields.qandas = [];
    if (updatedFields.reviews === '') updatedFields.reviews = [];
    if (updatedFields.galleryImages === '') updatedFields.galleryImages = [];

    // Explicitly preserve existing media if not provided
    if (newVideo) {
      updatedFields.video = newVideo.startsWith('http')
        ? newVideo
        : `${folder}/${newVideo}`;
    } else if (typeof body.video === 'string' && body.video.startsWith('http')) {
      updatedFields.video = body.video;
    } else if (body.video === '' || body.video === null) {
      // Explicitly clear if sent as empty
      updatedFields.video = null;
    }
    // If neither condition is met, don't set updatedFields.video to preserve existing

    if (newMainImage) {
      updatedFields.mainImage = newMainImage.startsWith('http')
        ? newMainImage
        : `${folder}/${newMainImage}`;
    } else if (typeof body.mainImage === 'string' && body.mainImage.startsWith('http')) {
      updatedFields.mainImage = body.mainImage;
    } else if (body.mainImage === '' || body.mainImage === null) {
      // Explicitly clear if sent as empty
      updatedFields.mainImage = null;
    }
    // If neither condition is met, don't set updatedFields.mainImage to preserve existing

    if (newGalleryImages?.length) {
      updatedFields.galleryImages = newGalleryImages.map((img) =>
        img.startsWith('http')
          ? img
          : `${folder}/${img}`
      );
    } else if (body.galleryImages) {
      if (Array.isArray(body.galleryImages)) {
        updatedFields.galleryImages = body.galleryImages.filter(img => typeof img === 'string' && img.startsWith('http'));
      } else if (typeof body.galleryImages === 'string') {
        updatedFields.galleryImages = body.galleryImages.split(',').map(img => img.trim()).filter(img => img.startsWith('http'));
      }
    } else if (body.galleryImages === '' || (Array.isArray(body.galleryImages) && body.galleryImages.length === 0)) {
      // Explicitly clear if sent as empty
      updatedFields.galleryImages = [];
    }
    // If neither condition is met, don't set updatedFields.galleryImages to preserve existing

    // Auto-generate missing variant SKUs
    if (updatedFields.variants && updatedFields.variants.length > 0) {
      const seller = await mongoose.model("Seller").findById(existingProduct.seller);
      const category = await mongoose.model("Category").findById(existingProduct.category);

      try {
        const { variantSku: nextVariantSku, updated } = await fillMissingVariantSkus({
          product: existingProduct,
          variants: updatedFields.variants,
          variantSku: updatedFields.variantSku || existingProduct.variantSku || {},
          baseSku: updatedFields.sku || existingProduct.sku,
          category,
          seller,
        });
        if (updated) {
          updatedFields.variantSku = nextVariantSku;
        }
      } catch (err) {
        if (err instanceof VariantSkuGenerationError) {
          return sendErrorResponse(
            res,
            HTTP_STATUS.BAD_REQUEST,
            err.message,
            ERROR_CODES.VALIDATION_FAILED
          );
        }
        throw err;
      }
    }

    // 🛡️ Set approvalStatus to "pending" when seller publishes a product
    const isPublishing = isDraftToPublishedTransition(
      existingProduct.status,
      updatedFields.status ?? body.status
    );
    const isUnpublishing = updatedFields.status === "draft" && existingProduct.status === "published";

    if (isPublishing) {
      try {
        updatedFields.slug = await enforcePublishSlugOnTransition({
          isDraftToPublished: true,
          name: body.name,
          currentSlug: existingProduct.slug,
          productId,
          actor: "seller",
        });
      } catch (guardError) {
        return sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          guardError.message,
          ERROR_CODES.VALIDATION_FAILED
        );
      }
    }

    if (isPublishing) {
      // When publishing, set approvalStatus to "pending" for admin approval
      updatedFields.approvalStatus = "pending";
    } else if (isUnpublishing) {
      // When unpublishing (changing from published to draft), remove approvalStatus
      // Use $unset to properly remove the field
      const updateOperation = { $set: updatedFields, $unset: { approvalStatus: "" } };
      const updated = await Product.findByIdAndUpdate(productId, updateOperation, {
        new: true,
      });
      return sendSuccessResponse(res, HTTP_STATUS.OK, "✅ Product updated successfully", { product: updated });
    }
    // If already published and staying published, don't touch approvalStatus
    // Let admin approval status remain unchanged

    const updated = await Product.findByIdAndUpdate(productId, { $set: updatedFields }, {
      new: true,
    });
    sendSuccessResponse(res, HTTP_STATUS.OK, "✅ Product updated successfully", { product: updated });
  } catch (err) {
    console.error("❌ Update product error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "❌ Failed to update product", ERROR_CODES.INTERNAL_ERROR, { error: err.message });
  }
};

// 🗑️ Delete Product (Seller) - Moves to trash by default
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      seller: req.user._id,
    });
    if (!product) return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Product not found", ERROR_CODES.RESOURCE_NOT_FOUND);

    if (product.status === "trash") {
      // Permanent delete if already in trash
      // Use the product we already found (with ownership verified) to delete
      const deleted = await Product.findByIdAndDelete(product._id);

      if (!deleted) {
        return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Product not found for deletion", ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      // Delete files from R2
      if (deleted.mainImage) await deleteMediaObject(deleted.mainImage);
      if (deleted.galleryImages?.length) {
        for (const img of deleted.galleryImages) await deleteMediaObject(img);
      }
      if (deleted.video) await deleteMediaObject(deleted.video);

      // Delete variant media files if any
      if (deleted.variantMedia && typeof deleted.variantMedia === 'object') {
        for (const variantKey in deleted.variantMedia) {
          const variant = deleted.variantMedia[variantKey];
          if (variant.mainImage) await deleteMediaObject(variant.mainImage);
          if (variant.video) await deleteMediaObject(variant.video);
          if (variant.galleryImages && Array.isArray(variant.galleryImages)) {
            for (const img of variant.galleryImages) {
              await deleteMediaObject(img);
            }
          }
        }
      }

      return sendSuccessResponse(res, HTTP_STATUS.OK, "✅ Product permanently deleted");
    }

    product.status = "trash";
    await product.save();
    sendSuccessResponse(res, HTTP_STATUS.OK, "✅ Product moved to trash");
  } catch (err) {
    console.error("❌ Delete product error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "❌ Failed to delete product", ERROR_CODES.INTERNAL_ERROR, { error: err.message });
  }
};

// 🚮 Move to Trash (Explicit)
exports.moveToTrash = async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, seller: req.user._id },
      { status: "trash" },
      { new: true }
    );
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "✅ Product moved to trash", product });
  } catch (err) {
    console.error("❌ Trash error:", err);
    res.status(500).json({ message: "❌ Failed to move product to trash" });
  }
};


//
// 📤 Bulk Upload CSV (Seller) — delegated to bulkProductImportController
//
const bulkProductImportController = require('./bulkProductImportController');
exports.bulkUploadProducts = (req, res) => bulkProductImportController.bulkUploadSeller(req, res);

// 📥 Export Products (Seller)
exports.exportProducts = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id || req.user.id;
    if (!sellerId) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.UNAUTHORIZED,
        "Unauthorized",
        ERROR_CODES.AUTH_TOKEN_INVALID
      );
    }

    const products = await Product.find(
      productListingService.buildSellerBaseFilter(sellerId)
    )
      .populate('brand', 'name slug')
      .populate('category', 'name slug')
      .populate('subcategory', 'name slug')
      .populate('childCategory', 'name slug')
      .populate('weightClass', 'name')
      .populate('secondaryCategories.category', 'name slug')
      .populate('secondaryCategories.subcategory', 'name slug')
      .populate('secondaryCategories.childCategory', 'name slug')
      .populate('seller')
      .sort({ createdAt: -1 })
      .lean();

    if (!products || products.length === 0) {
      return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "No products found to export", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const csv = formatProductsForExport(products);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=seller_products_export.csv`);
    res.status(200).send(csv);
  } catch (error) {
    console.error("❌ Seller export error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Export failed", ERROR_CODES.INTERNAL_ERROR);
  }
});

module.exports = {
  addProduct: exports.addProduct,
  autoSaveProduct: exports.autoSaveProduct,
  getLatestDraft: exports.getLatestDraft,
  getMyProducts: exports.getMyProducts,
  checkPrimaryKeywordAvailability: exports.checkPrimaryKeywordAvailability,
  getProductById: exports.getProductById,
  getAllProducts: exports.getAllProducts,
  updateProduct: exports.updateProduct,
  deleteProduct: exports.deleteProduct,
  moveToTrash: exports.moveToTrash,
  bulkUploadProducts: exports.bulkUploadProducts,
  exportProducts: exports.exportProducts,
};
