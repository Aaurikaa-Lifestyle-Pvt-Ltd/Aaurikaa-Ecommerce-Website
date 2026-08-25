// backend/controllers/productBackupController.js
// JSON Backup Export & Restore — additive only; does not touch CSV or bulk-upload.

const Product = require("../models/Product");
const mongoose = require("mongoose");
const productListingService = require("../services/productListingService");
const {
  resolveSellerIdForAaurikaaAdminWrite,
} = require("../services/aaurikaaFoundationService");
const {
  sendErrorResponse,
  HTTP_STATUS,
  ERROR_CODES,
} = require("../utils/errorHandler");

const RESTORE_FORBIDDEN_KEYS = ["_id", "__v", "createdAt", "updatedAt"];
const BACKUP_VERSION = "1.0";

/** Product schema ObjectId ref paths (single ref or array of refs). */
const REF_PATHS = [
  "brand", "seller", "admin", "ownerUserId", "sellerShop",
  "category", "subcategory", "childCategory",
  "mainImageId", "videoId", "batchId",
];
const REF_ARRAY_PATHS = ["galleryImageIds"];

/**
 * JSON Backup Export — Seller scope (only seller's products).
 * No .select() so every schema field is included; .lean() for plain objects;
 * .populate() for brand/category/subcategory/childCategory/seller (refs become objects in JSON).
 */
exports.exportProductsJsonSeller = async (req, res) => {
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
      .populate("brand", "name slug")
      .populate("category", "name slug")
      .populate("subcategory", "name slug")
      .populate("childCategory", "name slug")
      .populate("seller")
      .sort({ createdAt: -1 })
      .lean();

    const payload = {
      metadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: String(sellerId),
        version: BACKUP_VERSION,
        mode: "json-backup",
      },
      products: products || [],
    };

    const filename = `products_backup_seller_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(JSON.stringify(payload, null, 0));
  } catch (error) {
    console.error("❌ JSON export (seller) error:", error);
    sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "JSON export failed",
      ERROR_CODES.INTERNAL_ERROR
    );
  }
};

/**
 * JSON Backup Export — Admin scope (all products).
 * No .select() so every schema field is included; .lean(); .populate() as above.
 */
exports.exportProductsJsonAdmin = async (req, res) => {
  try {
    const products = await Product.find({})
      .populate("brand", "name slug")
      .populate("category", "name slug")
      .populate("subcategory", "name slug")
      .populate("childCategory", "name slug")
      .populate("seller")
      .sort({ createdAt: -1 })
      .lean();

    const payload = {
      metadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: String(req.user._id),
        version: BACKUP_VERSION,
        mode: "json-backup",
      },
      products: products || [],
    };

    const filename = `products_backup_admin_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(JSON.stringify(payload, null, 0));
  } catch (error) {
    console.error("❌ JSON export (admin) error:", error);
    sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "JSON export failed",
      ERROR_CODES.INTERNAL_ERROR
    );
  }
};

/**
 * Extract a value suitable for an ObjectId ref from exported JSON.
 * Export may have populated refs (object with _id) or raw id (string).
 */
function toRefId(value) {
  if (value == null) return undefined;
  if (typeof value === "object" && value._id != null) return value._id;
  if (typeof value === "string" && value.trim() !== "") return value;
  if (mongoose.Types.ObjectId.isValid(value)) return value;
  return undefined;
}

/**
 * Deep clone via JSON so we don't mutate request body and nested structures
 * (e.g. bulkDiscount) can be safely modified by Product pre-save.
 */
function deepCloneProduct(obj) {
  if (!obj || typeof obj !== "object") return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    return { ...obj };
  }
}

/**
 * Ensure a value is an array of strings (for gallery fields).
 * Handles: already array, JSON array string (e.g. '["url1","url2"]'), comma-separated string, or missing.
 * If the string looks like a JSON array we parse it so we never store a single element like '["https://..."]'
 * (which would make the edit form show http://localhost:5000/uploads/["https://..."] and break).
 */
function ensureStringArray(val) {
  if (Array.isArray(val)) {
    return val.filter((item) => typeof item === "string" && item.trim() !== "");
  }
  if (typeof val === "string" && val.trim() !== "") {
    const trimmed = val.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((item) => typeof item === "string" && item.trim() !== "");
        }
      } catch (_) {
        // fall through to comma-split
      }
    }
    return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Normalize main galleryImages and variantMedia.*.galleryImages so they are
 * always arrays (UI and Mongoose Mixed expect arrays; missing/string can break display).
 */
function normalizeGalleryFields(product) {
  if (!product || typeof product !== "object") return;
  product.galleryImages = ensureStringArray(product.galleryImages);

  if (product.variantMedia && typeof product.variantMedia === "object" && !Array.isArray(product.variantMedia)) {
    Object.keys(product.variantMedia).forEach((key) => {
      const entry = product.variantMedia[key];
      if (entry && typeof entry === "object") {
        if (!entry.galleryImages || !Array.isArray(entry.galleryImages)) {
          entry.galleryImages = ensureStringArray(entry.galleryImages);
        } else {
          entry.galleryImages = entry.galleryImages.filter((item) => typeof item === "string" && item.trim() !== "");
        }
        if (entry.mainImage == null) entry.mainImage = "";
        if (entry.video == null) entry.video = "";
      }
    });
  }
}

/**
 * Sanitize one product for restore: deep clone, remove DB ids/timestamps,
 * normalize refs (populated objects → id), clear batch/importDecision.
 */
function sanitizeProductForRestore(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = deepCloneProduct(obj);
  RESTORE_FORBIDDEN_KEYS.forEach((key) => delete out[key]);
  out.batchId = undefined;
  out.importDecision = undefined;
  REF_PATHS.forEach((path) => {
    if (out[path] != null) {
      const id = toRefId(out[path]);
      out[path] = id !== undefined ? id : undefined;
    }
  });
  REF_ARRAY_PATHS.forEach((path) => {
    if (Array.isArray(out[path])) {
      out[path] = out[path].map(toRefId).filter((id) => id != null);
    }
  });
  normalizeGalleryFields(out);
  return out;
}

/**
 * JSON Restore Import — Seller: override seller to authenticated seller.
 */
exports.importProductsJsonSeller = async (req, res) => {
  return importProductsJson(req, res, { overrideSeller: req.user._id });
};

/**
 * JSON Restore Import — Admin: always pin commercial owner to AAURIKAA internal Seller.
 * Client/JSON sellerId is ignored (same as admin create/update/bulk-upload).
 */
exports.importProductsJsonAdmin = async (req, res) => {
  const sellerId = await resolveSellerIdForAaurikaaAdminWrite(null);
  return importProductsJson(req, res, {
    overrideSeller: sellerId,
  });
};

/**
 * Shared JSON import logic. Insert as new; skip when SKU exists.
 * Preserves nested structures exactly (no flattening/parsing).
 */
async function importProductsJson(req, res, options) {
  const { overrideSeller, defaultSellerIfMissing } = options || {};
  try {
    const body = req.body;
    if (!body || typeof body !== "object") {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Request body must be JSON with metadata and products",
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    let products = body.products;
    if (!Array.isArray(products)) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "products must be an array",
        ERROR_CODES.VALIDATION_FAILED
      );
    }
    if (products.length === 0) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "products array cannot be empty",
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    const result = { inserted: 0, skipped: 0, failed: 0, errors: [] };

    for (let i = 0; i < products.length; i++) {
      const raw = products[i];
      if (!raw || typeof raw !== "object") {
        result.failed++;
        result.errors.push({ index: i, message: "Invalid product object" });
        continue;
      }

      const sanitized = sanitizeProductForRestore(raw);

      if (overrideSeller) {
        sanitized.seller = overrideSeller;
        sanitized.ownerUserId = overrideSeller;
      } else if (defaultSellerIfMissing && !sanitized.seller) {
        sanitized.seller = defaultSellerIfMissing;
        sanitized.ownerUserId = defaultSellerIfMissing;
      }
      // Ensure ownerUserId is always set so products can be trashed later (fix orphaned products)
      if (sanitized.ownerUserId == null) {
        sanitized.ownerUserId = sanitized.seller || defaultSellerIfMissing || overrideSeller || req.user._id;
      }

      const sku =
        typeof sanitized.sku === "string"
          ? sanitized.sku.trim()
          : String(sanitized.sku || "").trim();
      if (!sku) {
        result.failed++;
        result.errors.push({ index: i, sku: sku || "(missing)", message: "SKU is required" });
        continue;
      }

      const existing = await Product.findOne({ sku }).lean();
      if (existing) {
        result.skipped++;
        continue;
      }

      try {
        const doc = new Product(sanitized);
        // Mongoose often does not persist Schema.Types.Mixed when building from plain object;
        // set them explicitly and mark modified so they are saved.
        const mixedPaths = ["variantPricing", "variantStock", "variantSku", "variantMedia", "variantDefinitions"];
        for (const path of mixedPaths) {
          if (sanitized[path] !== undefined && sanitized[path] !== null && typeof sanitized[path] === "object") {
            doc[path] = sanitized[path];
            doc.markModified(path);
          }
        }
        await doc.save();
        result.inserted++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          index: i,
          sku,
          message: err.message || "Insert failed",
        });
      }
    }

    res.status(200).json({
      success: true,
      inserted: result.inserted,
      skipped: result.skipped,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error) {
    console.error("❌ JSON import error:", error);
    sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "JSON restore failed",
      ERROR_CODES.INTERNAL_ERROR
    );
  }
}
