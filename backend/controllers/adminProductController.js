const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { Readable } = require("stream");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const SellerShop = require("../models/SellerShop");
const Seller = require("../models/Seller");
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require("../utils/errorHandler");
const { deleteMediaObject } = require("../services/r2UploadService");
const { parseBulkDiscount } = require("../utils/bulkDiscountParser");
const { validateProductRows } = require("../utils/bulkUploadValidator");
const { convertProductRows } = require("../utils/bulkUploadTypeConverter");
const { generateSku, buildSkuProductSnapshot } = require("../utils/skuGenerator");
const Brand = require("../models/brand");
const SkuRule = require("../models/SkuRule");
const { VALID_SEGMENT_TYPES } = require("../utils/skuGenerator");
const {
  assertPublishable,
  checkPrimaryKeywordAvailability,
  enforcePublishSlugOnTransition,
  isDraftToPublishedTransition,
  resolveEffectiveProductStatus,
} = require("../utils/productPublishGuard");
const { formatProductsForExport, formatProductsForExportXlsx } = require("../utils/productExportService");
const {
  getProductTemplateSpec,
  buildProductTemplate,
} = require("../utils/catalogueImportTemplates");
const {
  validateProductWeightClass,
} = require("../utils/catalogShippingValidation");

/** Empty weightClass must not be cast to ObjectId (same gate as autosave). */
function isEmptyWeightClassInput(value) {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "null" ||
    value === "undefined"
  );
}

/**
 * Prefer request weightClass; when empty, keep existing so published edits
 * that omit the field (Admin FormData) do not clear the Shipping Slab.
 */
function resolveWeightClassInputForWrite(requested, existingWeightClass) {
  if (isEmptyWeightClassInput(requested) && existingWeightClass != null && existingWeightClass !== "") {
    return existingWeightClass;
  }
  return requested;
}
const {
  normalizeProductReturnPolicyFields,
} = require("../utils/returnPolicyResolver");
const {
  pickAssuranceWriteFields,
  stripFlatAssuranceAliases,
} = require("../utils/productAssuranceFields");
const ImportBatch = require("../models/ImportBatch");
const productListingService = require("../services/productListingService");
const {
  synchronizeSkuChange,
  remapPromotionSkuReferences,
} = require("../services/skuSynchronizationService");
const {
  fillMissingVariantSkus,
  regenerateAllVariantSkus,
  VariantSkuGenerationError,
} = require("../utils/variantSkuGeneration");
const {
  assertValidPrimaryPath,
  normalizeAndValidateSecondaryCategories,
  resolveEffectivePrimaryPath,
} = require("../utils/productCategoryValidation");
const {
  resolveSellerIdForAaurikaaAdminWrite,
} = require("../services/aaurikaaFoundationService");
const {
  normalizeProductTagsForWrite,
  hasTagsField,
} = require("../utils/productTags");
const { normalizeFeaturesForWrite } = require("../utils/keyFeatureNormalization");
const { mergePrimaryKeywordIntoSeo } = require("../utils/primaryKeywordValidation");


//
// 🛠️ Helper Functions
//
const safeParse = (val) => {
  try {
    return val ? JSON.parse(val) : [];
  } catch {
    return [];
  }
};

const safeParseObject = (val) => {
  try {
    if (!val || val === '' || val === '{}') return {};
    if (typeof val === 'string') {
      const parsed = JSON.parse(val);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
    }
    return typeof val === 'object' && val !== null && !Array.isArray(val) ? val : {};
  } catch {
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

// Local file deletion removed - now using R2 deletion

// Admin folder fixed
const getAdminFolder = () => "admin";

//
// ➕ Add Product (Admin Only)
//
exports.addProduct = async (req, res) => {
  try {
    const body = req.body;
    const folder = getAdminFolder();

    // Shipping Slab required only when effective status is published (drafts may omit).
    let existingStatusForWeight = null;
    let existingWeightClassForWrite = null;
    const draftIdForWeightGate = body.id || body.draftId;
    if (draftIdForWeightGate && mongoose.Types.ObjectId.isValid(draftIdForWeightGate)) {
      const draftGate = await Product.findOne({
        _id: draftIdForWeightGate,
        ownerUserId: req.user._id,
      })
        .select("status weightClass")
        .lean();
      if (draftGate) {
        existingStatusForWeight = draftGate.status;
        existingWeightClassForWrite = draftGate.weightClass;
      }
    }
    const effectiveStatusForWeight = resolveEffectiveProductStatus(
      body.status,
      existingStatusForWeight
    );
    const weightClassRequired = effectiveStatusForWeight === "published";
    const weightClassValidation = await validateProductWeightClass(
      resolveWeightClassInputForWrite(body.weightClass, existingWeightClassForWrite),
      { required: weightClassRequired }
    );
    if (!weightClassValidation.valid) {
      return res.status(400).json({ success: false, message: weightClassValidation.message });
    }
    const normalizedWeightClass = weightClassValidation.value;

    const returnPolicyFields = normalizeProductReturnPolicyFields(body);
    if (!returnPolicyFields.valid) {
      return res.status(400).json({ success: false, message: returnPolicyFields.message });
    }

    try {
      await assertPublishable(body, "admin", body.id || body.draftId);
    } catch (guardError) {
      return res.status(400).json({ success: false, message: guardError.message });
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
    // Multer might put single string or array in body if fields are sent
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

    // FormData may send seo as a JSON string, or flat/dotted primaryKeyword keys.
    if (typeof cleanBody.seo === "string") {
      try {
        cleanBody.seo = cleanBody.seo === "" ? {} : JSON.parse(cleanBody.seo);
      } catch {
        delete cleanBody.seo;
      }
    }
    mergePrimaryKeywordIntoSeo(cleanBody);

    // ✅ Map shopName to sellerShop for backward compatibility (old forms may still send shopName)
    if (body.shopName && !body.sellerShop) {
      cleanBody.sellerShop = body.shopName;
    }

    // AAURIKAA: Admin cannot choose a Seller. Client sellerId / sellerShop is ignored.
    const sellerId = await resolveSellerIdForAaurikaaAdminWrite(null);
    const sellerShopId = sellerId;

    // 🛡️ Manual Seller Assignment Validation
    if (sellerId) {
      // Check for Admin _id misuse (Semantic Separation)
      if (req.user?._id && sellerId === req.user._id.toString()) {
        console.warn(`[VALIDATION] Admin ${req.user._id} attempted to assign themselves to 'seller' field. Rejected.`);
        return res.status(400).json({ message: "❌ Invalid seller selection. Admin cannot be assigned as a product seller." });
      }

      // Ensure seller exists in Seller collection
      const sellerExists = await Seller.exists({ _id: sellerId });
      if (!sellerExists) {
        return res.status(400).json({ message: "❌ Invalid seller ID. The selected seller record does not exist." });
      }

      // Optional Consistency Check
      if (sellerShopId && sellerId !== sellerShopId) {
        return res.status(400).json({ message: "❌ Semantic mismatch: Seller and Seller Shop must reference the same record." });
      }
    }

    // Remove sellerShop from cleanBody to set it explicitly later
    delete cleanBody.sellerShop;
    delete cleanBody.shopName; // Remove shopName to avoid confusion
    delete cleanBody.tags;
    delete cleanBody.weightClass;

    // Ensure array fields are properly formatted (convert empty strings to empty arrays)
    const reviews = body.reviews === '' ? [] : safeParse(body.reviews);
    const variants = body.variants === '' ? [] : safeParse(body.variants);
    const features = body.features === undefined ? undefined : normalizeFeaturesForWrite(body.features);
    const qandas = body.qandas === '' ? [] : safeParse(body.qandas);
    const pickLastNonEmptyString = (value) => {
      if (Array.isArray(value)) {
        const nonEmpty = value.filter(v => typeof v === 'string' && v.trim() !== '');
        return nonEmpty.length > 0 ? nonEmpty[nonEmpty.length - 1].trim() : '';
      }
      return typeof value === 'string' ? value.trim() : '';
    };
    const featuresContent = pickLastNonEmptyString(body.featuresContent);
    const usageSafetyContent = pickLastNonEmptyString(body.usageSafetyContent);

    // Ensure these multipart fields never remain arrays in the spread `cleanBody`.
    cleanBody.featuresContent = featuresContent;
    cleanBody.usageSafetyContent = usageSafetyContent;
    // Handle multer.any() array format for usageInstructions
    let usageInstructionsValue = body.usageInstructions;
    console.log('🔍 Raw usageInstructions from body:', {
      type: typeof usageInstructionsValue,
      isArray: Array.isArray(usageInstructionsValue),
      value: usageInstructionsValue
    });

    if (Array.isArray(usageInstructionsValue) && usageInstructionsValue.length > 0) {
      // Filter out empty strings and get the last non-empty value
      const nonEmpty = usageInstructionsValue.filter(v => v && v !== '');
      usageInstructionsValue = nonEmpty.length > 0 ? nonEmpty[nonEmpty.length - 1] : '';
      console.log('📝 Extracted value:', usageInstructionsValue);
    }
    const usageInstructions = usageInstructionsValue === undefined
      ? undefined
      : (usageInstructionsValue === '' ? [] : safeParse(usageInstructionsValue));
    console.log('✅ Parsed usageInstructions:', {
      type: typeof usageInstructions,
      isArray: Array.isArray(usageInstructions),
      value: usageInstructions
    });
    const processedGalleryImages = body.galleryImages === '' ? [] : galleryImages;

    // Parse variant-level data
    const variantPricing = body.variantPricing ? safeParse(body.variantPricing) : undefined;
    const variantStock = body.variantStock ? safeParse(body.variantStock) : undefined;
    let variantMedia = body.variantMedia !== undefined
      ? (body.variantMedia ? safeParseObject(body.variantMedia) : undefined)
      : undefined;
    const variantSku = body.variantSku !== undefined
      ? (body.variantSku ? safeParseObject(body.variantSku) : undefined)
      : undefined;

    // Validate variant SKU if variants exist
    if (variants && variants.length > 0 && variantSku) {
      // Check that all variant combinations have SKUs
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
        return res.status(400).json({
          success: false,
          message: `Duplicate SKUs found within this product. Each variant must have a unique SKU. Duplicates: ${[...new Set(duplicateSkus)].join(', ')}`
        });
      }

      // Check uniqueness across all products in database
      for (const skuValue of skuValues) {
        const existingProduct = await Product.findOne({
          $or: [
            { sku: skuValue },
            { 'variantSku': { $type: 'object' }, [`variantSku.${Object.keys(variantSku).find(k => variantSku[k] === skuValue)}`]: skuValue }
          ]
        });

        if (existingProduct) {
          return res.status(400).json({
            success: false,
            message: `SKU "${skuValue}" already exists. Each variant SKU must be unique across all products.`
          });
        }
      }
    }

    // Process variant media files if any (for add)
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
            // Multiple gallery images
            variantMediaFiles[variantKey][field] = files.map(file =>
              file.filename.startsWith('http')
                ? file.filename
                : `${folder}/${file.filename}`
            );
          } else {
            // Single file (mainImage or video)
            const file = files[0];
            variantMediaFiles[variantKey][field] = file.filename.startsWith('http')
              ? file.filename
              : `${folder}/${file.filename}`;
          }
        }
      });

      // Merge uploaded files into variantMedia
      if (Object.keys(variantMediaFiles).length > 0) {
        if (!variantMedia) variantMedia = {};
        Object.keys(variantMediaFiles).forEach(key => {
          if (!variantMedia[key]) variantMedia[key] = {};
          variantMedia[key] = { ...variantMedia[key], ...variantMediaFiles[key] };
        });
      }
    }

    // WS-1 / 1.6 — category path validation (admin create / draft finalize)
    try {
      await assertValidPrimaryPath(cleanBody);
      if (body.secondaryCategories !== undefined) {
        cleanBody.secondaryCategories = await normalizeAndValidateSecondaryCategories(
          body.secondaryCategories,
          resolveEffectivePrimaryPath(cleanBody)
        );
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
    let existingDraftSku = null;
    let isPublishing = false;
    const newStatus = body.status || "published";

    if (draftId && mongoose.Types.ObjectId.isValid(draftId)) {
      product = await Product.findOne({ _id: draftId, ownerUserId: req.user._id });
      if (product) {
        existingDraftSku = String(product.sku || "").trim();
      }
    }

    if (product) {
      isPublishing = isDraftToPublishedTransition(product.status, newStatus);
      // Update existing draft
      Object.assign(product, {
        ...cleanBody,
        returnPolicyMode: returnPolicyFields.returnPolicyMode,
        returnAllowed: returnPolicyFields.returnAllowed,
        returnWindowDays: returnPolicyFields.returnWindowDays,
        returnConditions: returnPolicyFields.returnConditions,
        ...pickAssuranceWriteFields(body),
        status: newStatus,
        regularPrice: Number(body.regularPrice) || 0,
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
        bulkDiscount: parseBulkDiscount(body.bulkDiscount),
        mainImage: mainImage || product.mainImage,
        mainImageId: mainImageId || product.mainImageId,
        galleryImages: processedGalleryImages.length > 0 ? processedGalleryImages : product.galleryImages,
        galleryImageIds: galleryImageIds.length > 0 ? galleryImageIds : product.galleryImageIds,
        video: video || product.video,
        videoId: videoId || product.videoId,
        variants,
        features: features !== undefined ? features : product.features,
        qandas,
        usageInstructions: usageInstructions !== undefined ? usageInstructions : product.usageInstructions,
        featuresContent,
        usageSafetyContent,
        reviews,
        upsellSkus: (body.upsellSkus || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        crossSellSkus: (body.crossSellSkus || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        boughtTogetherSkus: (body.boughtTogetherSkus || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        tags: normalizeProductTagsForWrite(body.tags),
        variantPricing: variantPricing || product.variantPricing,
        variantStock: variantStock || product.variantStock,
        variantMedia: variantMedia || product.variantMedia,
        variantSku: variantSku || product.variantSku,
        seller: sellerId || product.seller,
        sellerShop: sellerShopId || product.sellerShop
      });
    } else {
      isPublishing = isDraftToPublishedTransition(undefined, newStatus);
      // Create new product
      product = new Product({
        ...cleanBody, // Default to "standard" if not provided or empty
        returnPolicyMode: returnPolicyFields.returnPolicyMode,
        returnAllowed: returnPolicyFields.returnAllowed,
        returnWindowDays: returnPolicyFields.returnWindowDays,
        returnConditions: returnPolicyFields.returnConditions,
        ...pickAssuranceWriteFields(body),
        regularPrice: Number(body.regularPrice) || 0,
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
        bulkDiscount: parseBulkDiscount(body.bulkDiscount),
        mainImage,
        mainImageId,
        galleryImages: processedGalleryImages,
        galleryImageIds,
        video,
        videoId,

        variants,
        features: features ?? [],
        qandas,
        usageInstructions: usageInstructions ?? [],
        featuresContent,
        usageSafetyContent,
        reviews,
        upsellSkus: (body.upsellSkus || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        crossSellSkus: (body.crossSellSkus || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        boughtTogetherSkus: (body.boughtTogetherSkus || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        tags: normalizeProductTagsForWrite(body.tags),
        // Variant-level data (only set if provided)
        ...(variantPricing && Object.keys(variantPricing).length > 0 && { variantPricing }),
        ...(variantStock && Object.keys(variantStock).length > 0 && { variantStock }),
        ...(variantMedia && Object.keys(variantMedia).length > 0 && { variantMedia }),
        ...(variantSku && Object.keys(variantSku).length > 0 && { variantSku }),
        // ✅ Set seller from body (sellerId or sellerShop), not from req.user (which is admin)
        seller: sellerId || null,
        // ✅ Explicitly set sellerShop
        sellerShop: sellerShopId || null,

        ownerUserId: req.user._id, // ✅ Fixed: User-scoped ownership
        status: newStatus,
      });
    }

    // Auto-generate base SKU if missing
    if (!product.sku || product.sku.trim() === '') {
      const sellerModel = mongoose.model("Seller");
      const categoryModel = mongoose.model("Category");
      const seller = product.seller ? await sellerModel.findById(product.seller) : null;
      const category = product.category ? await categoryModel.findById(product.category) : null;
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
    if (variants && variants.length > 0) {
      const sellerModel = mongoose.model("Seller");
      const categoryModel = mongoose.model("Category");
      const seller = product.seller ? await sellerModel.findById(product.seller) : null;
      const category = product.category ? await categoryModel.findById(product.category) : null;

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
          return res.status(400).json({ success: false, message: err.message });
        }
        throw err;
      }
    }

    // ✅ Step 6 — Visibility Consistency (Admin Publish Only)
    if (product.status === "published") {
      product.approvalStatus = "approved";
    }

    let skuSyncResult = null;
    const resolvedPublishSku = String(product.sku || "").trim();
    if (
      product &&
      draftId &&
      existingDraftSku &&
      resolvedPublishSku &&
      resolvedPublishSku !== existingDraftSku
    ) {
      try {
        skuSyncResult = await synchronizeSkuChange({
          productId: product._id,
          oldSku: existingDraftSku,
          newSku: resolvedPublishSku,
          changedBy: req.user?._id,
          source: "admin_publish",
        });

        const remappedPromotions = remapPromotionSkuReferences(
          {
            upsellSkus: product.upsellSkus,
            crossSellSkus: product.crossSellSkus,
            boughtTogetherSkus: product.boughtTogetherSkus,
          },
          existingDraftSku,
          resolvedPublishSku
        );
        Object.assign(product, remappedPromotions);
      } catch (syncErr) {
        const statusCode = syncErr.statusCode || 500;
        return res.status(statusCode).json({
          success: false,
          message: syncErr.message,
          rollbackPerformed: Boolean(syncErr.rollbackPerformed),
        });
      }
    }

    try {
      product.slug = await enforcePublishSlugOnTransition({
        isDraftToPublished: isPublishing,
        name: body.name || product.name,
        currentSlug: product.slug,
        productId: product._id,
        actor: "admin",
      });
    } catch (guardError) {
      return res.status(400).json({ success: false, message: guardError.message });
    }

    await product.save();
    res.status(draftId ? 200 : 201).json({
      message: `✅ Product ${draftId ? "updated and published" : "added"} successfully`,
      product,
      ...(skuSyncResult && { skuSync: skuSyncResult }),
    });
  } catch (err) {
    console.error("❌ Add product error:", err);
    res.status(500).json({ message: "❌ Failed to add product" });
  }
};

//
// 💾 Auto-Save Product (Draft)
//
exports.autoSaveProduct = async (req, res) => {
  try {
    const { id, ...updateData } = req.body;
    updateData.status = "draft";
    updateData.ownerUserId = req.user._id;

    // WS-1 regression guard (1.8 / Phase 4): map flat primaryKeyword → seo.primaryKeyword
    mergePrimaryKeywordIntoSeo(updateData);

    // Sanitize updateData to prevent validation errors during draft save
    // weightClass (Shipping Slab) is nullable on drafts; empty string must not be cast to ObjectId
    const objectIdFields = ["brand", "seller", "admin", "category", "subcategory", "childCategory", "sellerShop", "weightClass"];
    objectIdFields.forEach(field => {
      if (updateData[field] === "" || updateData[field] === null || updateData[field] === "null" || updateData[field] === "undefined") {
        delete updateData[field];
      }
    });

    const aaurikaaSellerId = await resolveSellerIdForAaurikaaAdminWrite(null);
    if (aaurikaaSellerId) {
      updateData.seller = aaurikaaSellerId;
      updateData.sellerShop = aaurikaaSellerId;
    }

    if (!updateData.name || updateData.name.trim() === "") {
      updateData.name = "Untitled Draft";
    }

    if (updateData.regularPrice === undefined || updateData.regularPrice === null || updateData.regularPrice === "" || isNaN(Number(updateData.regularPrice))) {
      updateData.regularPrice = 0;
    } else {
      updateData.regularPrice = Number(updateData.regularPrice);
    }

    // Match create/update: empty salePrice must be numeric 0 (not "") so List/Sale round-trip cleanly.
    if (updateData.salePrice === undefined || updateData.salePrice === null || updateData.salePrice === "" || isNaN(Number(updateData.salePrice))) {
      updateData.salePrice = 0;
    } else {
      updateData.salePrice = Number(updateData.salePrice);
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

      const sellerId = updateData.seller || updateData.sellerShop; // Try to find seller ID in payload
      const categoryId = updateData.category;

      const seller = sellerId ? await sellerModel.findById(sellerId) : null;
      const category = categoryId ? await categoryModel.findById(categoryId) : null;

      updateData.sku = await generateSku({
        product: updateData, // pass updateData as partial product
        category: category,
        seller: seller
      });
    }

    let product;
    if (id) {
      const existingProduct = await Product.findOne({
        _id: id,
        ownerUserId: req.user._id,
      });

      if (existingProduct && existingProduct.status !== "draft") {
        return res.status(409).json({
          success: false,
          message: "Cannot auto-save: product is not a draft",
          product: existingProduct,
        });
      }

      const existingDraft = await Product.findOne({
        _id: id,
        ownerUserId: req.user._id,
        status: "draft",
      });

      if (existingDraft) {
        // WS-1 / 1.6 — validate secondary paths on admin autosave
        if (updateData.secondaryCategories !== undefined) {
          try {
            updateData.secondaryCategories = await normalizeAndValidateSecondaryCategories(
              updateData.secondaryCategories,
              resolveEffectivePrimaryPath(updateData, existingDraft)
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

        const existingBaseSku = String(existingDraft.sku || "").trim();
        const resolvedNewSku =
          updateData.sku !== undefined
            ? String(updateData.sku).trim()
            : existingBaseSku;

        if (resolvedNewSku && existingBaseSku && resolvedNewSku !== existingBaseSku) {
          try {
            await synchronizeSkuChange({
              productId: id,
              oldSku: existingBaseSku,
              newSku: resolvedNewSku,
              changedBy: req.user?._id,
              source: "admin_autosave",
            });
            delete updateData.sku;

            const remappedPromotions = remapPromotionSkuReferences(
              {
                upsellSkus: updateData.upsellSkus,
                crossSellSkus: updateData.crossSellSkus,
                boughtTogetherSkus: updateData.boughtTogetherSkus,
              },
              existingBaseSku,
              resolvedNewSku
            );
            Object.assign(updateData, remappedPromotions);
          } catch (syncErr) {
            const statusCode = syncErr.statusCode || 500;
            return res.status(statusCode).json({
              success: false,
              message: syncErr.message,
              rollbackPerformed: Boolean(syncErr.rollbackPerformed),
            });
          }
        }
      }

      product = await Product.findOneAndUpdate(
        { _id: id, ownerUserId: req.user._id, status: "draft" },
        updateData,
        { new: true, upsert: false }
      );
    }

    if (!product) {
      // WS-1 / 1.6 — validate secondary paths when creating a new admin draft via autosave
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

//
// 📄 Get Latest Draft (Admin)
//
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
// 📦 Get All Products (Admin)
// Legacy: no page/limit → array (unchanged). Paginated: page or limit → { products, pagination, tabCounts }.
//
exports.getAllProducts = async (req, res) => {
  try {
    const baseFilter = productListingService.buildAdminBaseFilter();

    if (!productListingService.isPaginatedMode(req.query)) {
      const products = await productListingService.listAllProductsLegacy({
        baseFilter,
        populate: productListingService.ADMIN_POPULATE,
      });
      return res.status(200).json(products);
    }

    const { products, pagination, tabCounts } =
      await productListingService.listProducts({
        baseFilter,
        query: req.query,
        populate: productListingService.ADMIN_POPULATE,
        isAdmin: true,
      });

    return res.status(200).json({ products, pagination, tabCounts });
  } catch (err) {
    console.error("❌ Fetch all products error:", err);
    res.status(500).json({ message: "❌ Failed to fetch all products" });
  }
};

//
// 🔍 Primary Keyword Availability (Admin — advisory)
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
// 🔍 Get Product by ID (Admin)
//
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      status: { $ne: "trash" } // 🚮 Prevent retrieval of trashed products via ID by default
    }).populate([
      { path: "category subcategory childCategory brand", select: "name" },
      { path: "seller", select: "firstName lastName shopName isApproved returnAllowed returnWindowDays returnConditions" },
      { path: "sellerShop", select: "firstName lastName shopName isApproved returnAllowed returnWindowDays returnConditions" },
      { path: "weightClass", select: "name" },
    ]);

    if (!product) return res.status(404).json({ message: "Product not found" });

    res.status(200).json(product);
  } catch (err) {
    console.error("❌ Get product error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

//
// ✏️ Update Product (Admin)
//
exports.updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const body = req.body;

    const returnPolicyFields = normalizeProductReturnPolicyFields(body);
    if (!returnPolicyFields.valid) {
      return res.status(400).json({ success: false, message: returnPolicyFields.message });
    }

    const existingProduct = await Product.findById(productId);
    if (!existingProduct)
      return res.status(404).json({ message: "Product not found" });

    // Shipping Slab required only when effective status is published (drafts may omit).
    const effectiveStatusForWeight = resolveEffectiveProductStatus(
      body.status,
      existingProduct.status
    );
    const weightClassRequired = effectiveStatusForWeight === "published";
    const weightClassValidation = await validateProductWeightClass(
      resolveWeightClassInputForWrite(body.weightClass, existingProduct.weightClass),
      { required: weightClassRequired }
    );
    if (!weightClassValidation.valid) {
      return res.status(400).json({ success: false, message: weightClassValidation.message });
    }
    const normalizedWeightClass = weightClassValidation.value;

    // Merge persisted title/SEO into the publish snapshot. Preserve existing SEO
    // when the Product form omits it — do not invent primaryKeyword for lifecycle.
    if (body.name == null || String(body.name).trim() === "") {
      body.name = existingProduct.name;
    }
    if (body.shortDesc == null) {
      body.shortDesc = existingProduct.shortDesc;
    }
    const existingSeo =
      existingProduct.seo && typeof existingProduct.seo.toObject === "function"
        ? existingProduct.seo.toObject()
        : existingProduct.seo || {};
    if (typeof body.seo === "string") {
      try {
        body.seo = body.seo === "" ? {} : JSON.parse(body.seo);
      } catch {
        body.seo = {};
      }
    }
    if (!body.seo || typeof body.seo !== "object") {
      body.seo = { ...existingSeo };
    } else if (!String(body.seo.primaryKeyword || "").trim() && existingSeo.primaryKeyword) {
      body.seo = { ...existingSeo, ...body.seo, primaryKeyword: existingSeo.primaryKeyword };
    }

    try {
      await assertPublishable(body, "admin", productId, existingProduct.status);
    } catch (guardError) {
      return res.status(400).json({ success: false, message: guardError.message });
    }

    const folder = getAdminFolder();

    // Handle main image - support both file uploads and library selections
    const newMainImage = (req.files?.mainImage?.[0]
      ? (req.files.mainImage[0].filename.startsWith('http')
        ? req.files.mainImage[0].filename
        : `${folder}/${req.files.mainImage[0].filename}`)
      : (typeof body.mainImage === 'string' ? body.mainImage : null));

    // Handle gallery images - merge file uploads with library selections
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

    // Handle video - support both file uploads and library selections
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

    // Filter out empty strings for ObjectId fields
    const cleanBody = { ...body };
    if (!cleanBody.subcategory || cleanBody.subcategory === '') {
      delete cleanBody.subcategory;
    }
    if (!cleanBody.childCategory || cleanBody.childCategory === '') {
      delete cleanBody.childCategory;
    }
    // Empty brand on update clears the association; omit brand key to leave unchanged.
    if (Object.prototype.hasOwnProperty.call(body, "brand")) {
      if (!cleanBody.brand || cleanBody.brand === "" || cleanBody.brand === "null") {
        cleanBody.brand = null;
      }
    } else {
      delete cleanBody.brand;
    }
    delete cleanBody.returnPolicyMode;
    delete cleanBody.returnAllowed;
    delete cleanBody.returnWindowDays;
    delete cleanBody.warranty;
    delete cleanBody.manufacturerConditions;
    delete cleanBody.genuineProduct;
    stripFlatAssuranceAliases(cleanBody);

    // FormData may send seo as a JSON string, or flat/dotted primaryKeyword keys.
    if (typeof cleanBody.seo === "string") {
      try {
        cleanBody.seo = cleanBody.seo === "" ? {} : JSON.parse(cleanBody.seo);
      } catch {
        delete cleanBody.seo;
      }
    }
    mergePrimaryKeywordIntoSeo(cleanBody);

    // ✅ Map shopName to sellerShop for backward compatibility
    if (body.shopName && !body.sellerShop) {
      cleanBody.sellerShop = body.shopName;
    }

    // AAURIKAA: Admin cannot choose or reassign Seller. Client sellerId / sellerShop is ignored.
    const sellerId = await resolveSellerIdForAaurikaaAdminWrite(null);
    const sellerShopId = sellerId;

    // Handle existingProduct.seller - could be ObjectId or populated object
    const existingSellerId = existingProduct.seller
      ? (existingProduct.seller._id ? existingProduct.seller._id.toString() : existingProduct.seller.toString())
      : null;

    if (sellerId && sellerId !== existingSellerId) {
      // Check for Admin _id misuse
      if (req.user?._id && sellerId === req.user._id.toString()) {
        console.warn(`[VALIDATION-EDIT] Admin ${req.user._id} attempted to assign themselves to 'seller' field on product ${productId}. Rejected.`);
        return res.status(400).json({ message: "❌ Invalid seller selection. Admin cannot be assigned as a product seller." });
      }

      // Ensure seller exists in Seller collection
      const sellerExists = await Seller.exists({ _id: sellerId });
      if (!sellerExists) {
        return res.status(400).json({ message: "❌ Invalid seller ID. The selected seller record does not exist." });
      }

      // Optional Consistency Check
      if (sellerShopId && sellerId !== sellerShopId) {
        return res.status(400).json({ message: "❌ Semantic mismatch: Seller and Seller Shop must reference the same record." });
      }
    }

    // Remove sellerShop from cleanBody to set it explicitly later
    delete cleanBody.sellerShop;
    delete cleanBody.shopName; // Remove shopName to avoid confusion
    // Never accept client-supplied ownerUserId on admin update (stale form / spoofing).
    // Ownership transfer sets it explicitly when seller changes.
    delete cleanBody.ownerUserId;

    // Remove media fields from cleanBody to prevent them from being overridden
    // These will be handled separately only if new files are uploaded
    delete cleanBody.galleryImages;
    delete cleanBody.mainImage;
    delete cleanBody.video;
    delete cleanBody.tags;
    delete cleanBody.weightClass;

    // Debug logging for featured status
    console.log('🔍 Featured status debug:', {
      rawValue: body.isFeatured,
      type: typeof body.isFeatured,
      convertedValue: toBool(body.isFeatured)
    });

    // Ensure array fields are properly formatted (convert empty strings to empty arrays)
    const reviews = body.reviews === '' ? [] : safeParse(body.reviews);
    const variants = body.variants === '' ? [] : safeParse(body.variants);
    const features = body.features === undefined ? undefined : normalizeFeaturesForWrite(body.features);
    const qandas = body.qandas === '' ? [] : safeParse(body.qandas);
    const pickLastNonEmptyString = (value) => {
      if (Array.isArray(value)) {
        const nonEmpty = value.filter(v => typeof v === 'string' && v.trim() !== '');
        return nonEmpty.length > 0 ? nonEmpty[nonEmpty.length - 1].trim() : '';
      }
      return typeof value === 'string' ? value.trim() : '';
    };
    const featuresContent = pickLastNonEmptyString(body.featuresContent);
    const usageSafetyContent = pickLastNonEmptyString(body.usageSafetyContent);

    // Ensure these multipart fields never remain arrays in the spread `cleanBody`.
    cleanBody.featuresContent = featuresContent;
    cleanBody.usageSafetyContent = usageSafetyContent;

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

    // Handle multer.any() array format for usageInstructions
    let usageInstructionsValue = body.usageInstructions;
    if (Array.isArray(usageInstructionsValue) && usageInstructionsValue.length > 0) {
      // Filter out empty strings and get the last non-empty value
      const nonEmpty = usageInstructionsValue.filter(v => v && v !== '');
      usageInstructionsValue = nonEmpty.length > 0 ? nonEmpty[nonEmpty.length - 1] : '';
    }
    const usageInstructions = usageInstructionsValue === undefined
      ? undefined
      : (usageInstructionsValue === '' ? [] : safeParse(usageInstructionsValue));

    // Parse variant-level data
    const variantPricing = body.variantPricing ? safeParse(body.variantPricing) : undefined;
    const variantStock = body.variantStock ? safeParse(body.variantStock) : undefined;
    let variantMedia = body.variantMedia !== undefined
      ? (body.variantMedia ? safeParseObject(body.variantMedia) : undefined)
      : undefined;
    const variantSku = body.variantSku !== undefined
      ? (body.variantSku ? safeParseObject(body.variantSku) : undefined)
      : undefined;

    // Validate variant SKU if variants exist
    if (variants && variants.length > 0 && variantSku) {
      // Check that all variant combinations have SKUs
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
        return res.status(400).json({
          success: false,
          message: `Duplicate SKUs found within this product. Each variant must have a unique SKU. Duplicates: ${[...new Set(duplicateSkus)].join(', ')}`
        });
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
          return res.status(400).json({
            success: false,
            message: `SKU "${skuValue}" already exists in another product. Each variant SKU must be unique across all products.`
          });
        }
      }
    }

    // Process variant media files if any (for update)
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
            // Multiple gallery images
            variantMediaFiles[variantKey][field] = files.map(file =>
              file.filename.startsWith('http')
                ? file.filename
                : `${folder}/${file.filename}`
            );
          } else {
            // Single file (mainImage or video)
            const file = files[0];
            variantMediaFiles[variantKey][field] = file.filename.startsWith('http')
              ? file.filename
              : `${folder}/${file.filename}`;
          }
        }
      });

      // Merge uploaded files into variantMedia
      if (Object.keys(variantMediaFiles).length > 0) {
        if (!variantMedia) variantMedia = {};
        Object.keys(variantMediaFiles).forEach(key => {
          if (!variantMedia[key]) variantMedia[key] = {};
          variantMedia[key] = { ...variantMedia[key], ...variantMediaFiles[key] };
        });
      }
    }

    // WS-1 / 1.6 — admin may change primary; validate taxonomy + secondary
    let validatedSecondaryCategories;
    try {
      await assertValidPrimaryPath(resolveEffectivePrimaryPath(body, existingProduct));
      if (body.secondaryCategories !== undefined) {
        validatedSecondaryCategories = await normalizeAndValidateSecondaryCategories(
          body.secondaryCategories,
          resolveEffectivePrimaryPath(body, existingProduct)
        );
      }
    } catch (categoryError) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        categoryError.message,
        ERROR_CODES.VALIDATION_FAILED
      );
    }
    delete cleanBody.secondaryCategories;

    const updatedFields = {
      ...cleanBody,
      regularPrice: Number(body.regularPrice) || 0,
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
      bulkDiscount: parseBulkDiscount(body.bulkDiscount),
      variants,
      features,
      qandas,
      usageInstructions,
      reviews,
      ...(validatedSecondaryCategories !== undefined
        ? { secondaryCategories: validatedSecondaryCategories }
        : {}),
      upsellSkus: (body.upsellSkus || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      crossSellSkus: (body.crossSellSkus || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      boughtTogetherSkus: (body.boughtTogetherSkus || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      ...(hasTagsField(body) && {
        tags: normalizeProductTagsForWrite(body.tags),
      }),
      // Internal Media IDs
      mainImageId: mainImageId || existingProduct.mainImageId,
      videoId: videoId || existingProduct.videoId,
      galleryImageIds: galleryImageIds.length > 0 ? galleryImageIds : existingProduct.galleryImageIds,

      // Variant-level data (only set if provided)
      ...(variantPricing !== undefined && { variantPricing: Object.keys(variantPricing).length > 0 ? variantPricing : undefined }),
      ...(variantStock !== undefined && { variantStock: Object.keys(variantStock).length > 0 ? variantStock : undefined }),
      ...(variantMedia !== undefined && { variantMedia: Object.keys(variantMedia).length > 0 ? variantMedia : undefined }),
      ...(variantSku !== undefined && { variantSku: Object.keys(variantSku).length > 0 ? variantSku : undefined }),
      // AAURIKAA: always pin commercial owner to the internal Seller. Do not transfer ownerUserId.
      ...(sellerId && { seller: sellerId, sellerShop: sellerId }),
    };

    // Handle R2 URLs (full URLs) vs local filenames
    // newMainImage, newGalleryImages, and newVideo already handle both files and body strings
    // Explicitly preserve existing media if not provided
    if (newMainImage) {
      // newMainImage already has the correct format (either full URL or folder-prefixed path)
      updatedFields.mainImage = newMainImage;
    } else if (body.mainImage === '' || body.mainImage === null) {
      // Explicitly clear if sent as empty
      updatedFields.mainImage = null;
    }
    // If neither condition is met, don't set updatedFields.mainImage to preserve existing

    if (newGalleryImages?.length) {
      // newGalleryImages already has the correct format (either full URLs or folder-prefixed paths)
      updatedFields.galleryImages = newGalleryImages;
    } else if (body.galleryImages === '' || (Array.isArray(body.galleryImages) && body.galleryImages.length === 0)) {
      // Explicitly clear if sent as empty
      updatedFields.galleryImages = [];
    }
    // If neither condition is met, don't set updatedFields.galleryImages to preserve existing

    if (newVideo) {
      // newVideo already has the correct format (either full URL or folder-prefixed path)
      updatedFields.video = newVideo;
    } else if (body.video === '' || body.video === null) {
      // Explicitly clear if sent as empty
      updatedFields.video = null;
    }
    // If neither condition is met, don't set updatedFields.video to preserve existing

    // Auto-generate SKU if being cleared or actively set to empty
    if ('sku' in updatedFields && (!updatedFields.sku || updatedFields.sku.trim() === '')) {
      const sellerModel = mongoose.model("Seller");
      const categoryModel = mongoose.model("Category");
      const seller = existingProduct.seller ? await sellerModel.findById(existingProduct.seller) : null;
      const category = existingProduct.category ? await categoryModel.findById(existingProduct.category) : null;

      updatedFields.sku = await generateSku({
        product: existingProduct,
        category: category,
        seller: seller
      });
    }

    // Auto-generate missing variant SKUs
    if (updatedFields.variants && updatedFields.variants.length > 0) {
      const sellerModel = mongoose.model("Seller");
      const categoryModel = mongoose.model("Category");
      const seller = existingProduct.seller ? await sellerModel.findById(existingProduct.seller) : null;
      const category = existingProduct.category ? await categoryModel.findById(existingProduct.category) : null;

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
          return res.status(400).json({ success: false, message: err.message });
        }
        throw err;
      }
    }

    const isDraftToPublished = isDraftToPublishedTransition(
      existingProduct.status,
      updatedFields.status ?? body.status
    );

    if (isDraftToPublished) {
      try {
        updatedFields.slug = await enforcePublishSlugOnTransition({
          isDraftToPublished: true,
          name: body.name,
          currentSlug: existingProduct.slug,
          productId,
          actor: "admin",
        });
      } catch (guardError) {
        return res.status(400).json({ success: false, message: guardError.message });
      }
    }

    // ✅ Step 6 — Visibility Consistency (Admin Publish Only)
    // If Admin explicitly sets status to published, or it stays published, ensure it's approved
    if (effectiveStatusForWeight === "published") {
      updatedFields.approvalStatus = "approved";
    }

    const resolvedNewSku =
      updatedFields.sku !== undefined
        ? String(updatedFields.sku).trim()
        : String(existingProduct.sku || "").trim();
    const existingBaseSku = String(existingProduct.sku || "").trim();
    let skuSyncResult = null;

    if (resolvedNewSku && existingBaseSku && resolvedNewSku !== existingBaseSku) {
      try {
        skuSyncResult = await synchronizeSkuChange({
          productId,
          oldSku: existingBaseSku,
          newSku: resolvedNewSku,
          changedBy: req.user?._id,
          source: "admin_update",
        });
        delete updatedFields.sku;

        const remappedPromotions = remapPromotionSkuReferences(
          {
            upsellSkus: updatedFields.upsellSkus,
            crossSellSkus: updatedFields.crossSellSkus,
            boughtTogetherSkus: updatedFields.boughtTogetherSkus,
          },
          existingBaseSku,
          resolvedNewSku
        );
        Object.assign(updatedFields, remappedPromotions);
      } catch (syncErr) {
        const statusCode = syncErr.statusCode || 500;
        return res.status(statusCode).json({
          success: false,
          message: syncErr.message,
          rollbackPerformed: Boolean(syncErr.rollbackPerformed),
        });
      }
    }

    const updated = await Product.findByIdAndUpdate(productId, updatedFields, {
      new: true,
    }).populate([
      { path: "category subcategory childCategory brand", select: "name" },
      { path: "seller", select: "firstName lastName shopName isApproved returnAllowed returnWindowDays returnConditions" },
      { path: "sellerShop", select: "firstName lastName shopName isApproved returnAllowed returnWindowDays returnConditions" },
      { path: "weightClass", select: "name" },
    ]);

    sendSuccessResponse(res, HTTP_STATUS.OK, "✅ Product updated successfully", {
      product: updated,
      ...(skuSyncResult && { skuSync: skuSyncResult }),
    });
  } catch (err) {
    console.error("❌ Update product error:", err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "❌ Failed to update product", ERROR_CODES.INTERNAL_ERROR, { error: err.message });
  }
};

const applyRegenerateSellerOverrides = (seller, overrides = {}) => {
  const hasSellerFields =
    "sellerShopName" in overrides ||
    "sellerFirstName" in overrides ||
    "sellerLastName" in overrides;

  if (!hasSellerFields) {
    return seller;
  }

  const base = seller
    ? typeof seller.toObject === "function"
      ? seller.toObject()
      : { ...seller }
    : {};

  if ("sellerShopName" in overrides) {
    base.shopName = overrides.sellerShopName == null ? "" : String(overrides.sellerShopName);
  }
  if ("sellerFirstName" in overrides) {
    base.firstName = overrides.sellerFirstName == null ? "" : String(overrides.sellerFirstName);
  }
  if ("sellerLastName" in overrides) {
    base.lastName = overrides.sellerLastName == null ? "" : String(overrides.sellerLastName);
  }

  return base;
};

const applyRegenerateProductOverrides = (skuProduct, overrides = {}) => {
  if (!skuProduct || !overrides || typeof overrides !== "object") {
    return skuProduct;
  }

  if (overrides.name !== undefined && overrides.name !== null) {
    skuProduct.name = String(overrides.name);
  }
  if (overrides.regularPrice !== undefined && overrides.regularPrice !== null && overrides.regularPrice !== "") {
    skuProduct.regularPrice = Number(overrides.regularPrice);
  }
  if (overrides.salePrice !== undefined && overrides.salePrice !== null && overrides.salePrice !== "") {
    skuProduct.salePrice = Number(overrides.salePrice);
  }
  if (overrides.stock !== undefined && overrides.stock !== null && overrides.stock !== "") {
    skuProduct.stock = Number(overrides.stock);
  }
  if (overrides.weight !== undefined && overrides.weight !== null && overrides.weight !== "") {
    skuProduct.weight = Number(overrides.weight);
  }

  return skuProduct;
};

/**
 * Regenerate SKU for a product and its variants (Admin Only)
 */
exports.regenerateSku = async (req, res) => {
  try {
    const productId = req.params.id;
    const { target, overrides } = req.body; // 'base', 'variants', or 'all'
    const regenOverrides = overrides && typeof overrides === "object" ? overrides : {};

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const activeRule = await SkuRule.findOne({ isActive: true });
    const activeRuleSegmentCount = (activeRule?.segments || []).filter(
      (seg) =>
        seg &&
        seg.enabled !== false &&
        VALID_SEGMENT_TYPES.includes(seg.type)
    ).length;

    if (!activeRule || activeRuleSegmentCount === 0) {
      return res.status(400).json({
        message:
          "No active SKU rule with valid segments found. Activate a SKU rule in Admin → SKU Settings before regenerating SKUs.",
      });
    }

    const sellerModel = mongoose.model("Seller");
    const categoryModel = mongoose.model("Category");

    let seller;
    if ("sellerId" in regenOverrides) {
      const overrideSellerId = extractSingleObjectId(regenOverrides.sellerId);
      if (regenOverrides.sellerId && !overrideSellerId) {
        return res.status(400).json({ message: "Invalid sellerId in overrides." });
      }
      if (overrideSellerId) {
        const sellerExists = await Seller.exists({ _id: overrideSellerId });
        if (!sellerExists) {
          return res.status(400).json({ message: "Invalid seller ID. The selected seller record does not exist." });
        }
        seller = await sellerModel.findById(overrideSellerId);
      } else {
        seller = null;
      }
    } else {
      seller = product.seller ? await sellerModel.findById(product.seller) : null;
    }
    seller = applyRegenerateSellerOverrides(seller, regenOverrides);

    let category;
    if ("categoryId" in regenOverrides) {
      const overrideCategoryId = extractSingleObjectId(regenOverrides.categoryId);
      if (regenOverrides.categoryId && !overrideCategoryId) {
        return res.status(400).json({ message: "Invalid categoryId in overrides." });
      }
      if (overrideCategoryId) {
        category = await categoryModel.findById(overrideCategoryId);
        if (!category) {
          return res.status(400).json({ message: "Invalid category ID. The selected category does not exist." });
        }
      } else {
        category = null;
      }
    } else {
      category = product.category ? await categoryModel.findById(product.category) : null;
    }

    let brandDoc;
    if ("brandId" in regenOverrides) {
      const overrideBrandId = extractSingleObjectId(regenOverrides.brandId);
      if (regenOverrides.brandId && !overrideBrandId) {
        return res.status(400).json({ message: "Invalid brandId in overrides." });
      }
      if (overrideBrandId) {
        brandDoc = await Brand.findById(overrideBrandId);
        if (!brandDoc) {
          return res.status(400).json({ message: "Invalid brand ID. The selected brand does not exist." });
        }
      } else {
        brandDoc = null;
      }
    } else if (product.brand) {
      brandDoc = await Brand.findById(product.brand._id || product.brand);
    } else {
      brandDoc = null;
    }

    const skuProduct = applyRegenerateProductOverrides(
      buildSkuProductSnapshot(product, brandDoc),
      regenOverrides
    );

    const variantsForRegen =
      "variants" in regenOverrides && Array.isArray(regenOverrides.variants)
        ? regenOverrides.variants
        : product.variants;

    const oldSku = String(product.sku || "").trim();
    let newBaseSku = null;
    let variantSkuUpdate = null;
    let skuSyncResult = null;
    let updated = false;

    // Regenerate Base SKU (in memory — persistence deferred to sync service)
    if (target === "base" || target === "all") {
      newBaseSku = await generateSku({
        product: skuProduct,
        category,
        seller,
        excludeSkus: [],
      });
      updated = true;
    }

    // Regenerate Variant SKUs
    if (target === "variants" || target === "all") {
      if (variantsForRegen && variantsForRegen.length > 0) {
        const baseSkuForVariants = newBaseSku || product.sku;
        const { variantSku: vSku } = await regenerateAllVariantSkus({
          product: skuProduct,
          variants: variantsForRegen,
          baseSku: baseSkuForVariants,
          category,
          seller,
        });
        variantSkuUpdate = vSku;
        updated = true;
      }
    }

    if (!updated) {
      return res.status(400).json({ message: "No SKU was regenerated" });
    }

    if (newBaseSku && newBaseSku !== oldSku) {
      try {
        skuSyncResult = await synchronizeSkuChange({
          productId,
          oldSku,
          newSku: newBaseSku,
          changedBy: req.user?._id,
          source: "regenerate",
        });
      } catch (syncErr) {
        const statusCode = syncErr.statusCode || 500;
        return res.status(statusCode).json({
          success: false,
          message: syncErr.message,
          rollbackPerformed: Boolean(syncErr.rollbackPerformed),
        });
      }
    }

    if (variantSkuUpdate) {
      await Product.findByIdAndUpdate(productId, { variantSku: variantSkuUpdate });
    }

    const refreshedProduct = await Product.findById(productId);
    return res.status(200).json({
      message: "✅ SKU regenerated successfully",
      product: refreshedProduct,
      ...(skuSyncResult && { skuSync: skuSyncResult }),
    });
  } catch (err) {
    console.error("❌ Regenerate SKU error:", err);
    res.status(500).json({ message: "❌ Failed to regenerate SKU", error: err.message });
  }
};

// 🗑️ Delete Product (Admin) - Moves to trash by default. Admin can trash any product (not limited by owner).
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id });
    if (!product) return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Product not found", ERROR_CODES.RESOURCE_NOT_FOUND);

    if (product.status === "trash") {
      // Permanent delete if already in trash
      const deleted = await Product.findByIdAndDelete(req.params.id);

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

// 🚮 Move to Trash (Explicit). Admin can trash any product (not limited by owner).
exports.moveToTrash = async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id },
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

// ♻️ Restore from Trash → draft. Minimal status flip (full PUT would wipe unset arrays).
exports.restoreFromTrash = async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, status: "trash" },
      { status: "draft" },
      { new: true }
    );
    if (!product) {
      return res.status(404).json({ message: "Trashed product not found" });
    }
    res.json({ message: "✅ Product restored to draft", product });
  } catch (err) {
    console.error("❌ Restore error:", err);
    res.status(500).json({ message: "❌ Failed to restore product" });
  }
};


//
// 📤 Bulk Upload CSV (Admin) — delegated to bulkProductImportController
// Seller assignment remains restricted via convertProductRows (admin uploader id).
//
const bulkProductImportController = require('./bulkProductImportController');
exports.bulkUploadProducts = (req, res) => bulkProductImportController.bulkUploadAdmin(req, res);

// 📊 Get Product Stats (Admin)
//
exports.getProductStats = async (req, res) => {
  try {
    const stats = await Product.aggregate([
      {
        $match: {
          status: { $ne: "trash" } // 📊 Exclude trashed products from stats
        }
      },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalStock: { $sum: "$stock" },
          avgPrice: { $avg: "$regularPrice" },
          approvedProducts: {
            $sum: { $cond: [{ $eq: ["$approvalStatus", "approved"] }, 1, 0] },
          },
          pendingProducts: {
            $sum: { $cond: [{ $eq: ["$approvalStatus", "pending"] }, 1, 0] },
          },
          rejectedProducts: {
            $sum: { $cond: [{ $eq: ["$approvalStatus", "rejected"] }, 1, 0] },
          },
        },
      },
    ]);

    res.status(200).json(stats[0] || {});
  } catch (err) {
    console.error("❌ Fetch product stats error:", err);
    res.status(500).json({ message: "❌ Failed to fetch product stats" });
  }
};

exports.updateProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    product.approvalStatus = status;

    // Ensure array fields are properly formatted (convert empty strings to empty arrays)
    if (product.reviews === '') product.reviews = [];
    if (product.variants === '') product.variants = [];
    if (product.features === '') product.features = [];
    if (product.qandas === '') product.qandas = [];
    if (product.galleryImages === '') product.galleryImages = [];
    await product.save();

    res.json({ message: `Product ${status}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// 📥 Export Products (Admin)
exports.exportProducts = asyncHandler(async (req, res) => {
  try {
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
    if (profile !== "full" && profile !== "operator") {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Invalid profile. Use profile=full or profile=operator",
        ERROR_CODES.INVALID_INPUT
      );
    }
    const operator = profile === "operator";

    const ids = String(req.query.ids || "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => mongoose.isValidObjectId(id));
    const skus = String(req.query.skus || "")
      .split(",")
      .map((sku) => sku.trim())
      .filter(Boolean);

    const listingKeys = ["search", "name", "sku", "status", "tab", "category", "subcategory", "childCategory", "brand", "approvalStatus"];
    const hasListingFilters = listingKeys.some((key) => {
      const value = req.query[key];
      return value != null && String(value).trim() !== "" && String(value).trim() !== "all";
    });

    let filter = {};
    if (ids.length) {
      filter._id = { $in: ids };
    }
    if (skus.length) {
      filter.sku = { $in: skus };
    }
    if (hasListingFilters) {
      const listingFilter = productListingService.applySearchAndFilters(
        { ...productListingService.buildAdminBaseFilter() },
        req.query,
        { isAdmin: true }
      );
      filter = ids.length || skus.length ? { $and: [filter, listingFilter] } : listingFilter;
    }

    const products = await Product.find(filter)
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

    const filenameBase = operator ? "aaurikaa_products_catalogue" : "aaurikaa_products_full_technical";

    if (format === "xlsx") {
      const buffer = formatProductsForExportXlsx(products, { operator });
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename=${filenameBase}.xlsx`);
      return res.status(200).send(buffer);
    }

    const csv = formatProductsForExport(products, { operator });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filenameBase}.csv`);
    res.status(200).send(csv);
  } catch (error) {
    console.error("❌ Admin export error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Export failed", ERROR_CODES.INTERNAL_ERROR);
  }
});

exports.downloadProductImportTemplate = asyncHandler(async (req, res) => {
  const rawFormat = req.query.format;
  const format = rawFormat == null || rawFormat === "" ? "csv" : String(rawFormat).toLowerCase();
  if (format === "json") {
    return sendSuccessResponse(res, HTTP_STATUS.OK, "Product import template spec", getProductTemplateSpec());
  }
  if (format !== "csv" && format !== "xlsx") {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid format. Use format=csv, format=xlsx, or format=json",
      ERROR_CODES.INVALID_INPUT
    );
  }
  const file = buildProductTemplate(format);
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename=${file.filename}`);
  return res.status(HTTP_STATUS.OK).send(file.buffer);
});
