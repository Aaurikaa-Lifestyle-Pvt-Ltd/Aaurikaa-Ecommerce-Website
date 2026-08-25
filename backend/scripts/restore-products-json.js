#!/usr/bin/env node
/**
 * Restore products from admin JSON backup (offline; no API auth required).
 * Usage: node scripts/restore-products-json.js [path-to-backup.json]
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Product = require("../models/Product");

const DEFAULT_BACKUP = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  "Downloads",
  "products_backup_admin_2026-02-22.json"
);

const RESTORE_FORBIDDEN_KEYS = ["_id", "__v", "createdAt", "updatedAt"];
const REF_PATHS = [
  "brand", "seller", "admin", "ownerUserId", "sellerShop",
  "category", "subcategory", "childCategory",
  "mainImageId", "videoId", "batchId",
];
const REF_ARRAY_PATHS = ["galleryImageIds"];

function toRefId(value) {
  if (value == null) return undefined;
  if (typeof value === "object" && value._id != null) return value._id;
  if (typeof value === "string" && value.trim() !== "") return value;
  if (mongoose.Types.ObjectId.isValid(value)) return value;
  return undefined;
}

function deepCloneProduct(obj) {
  return JSON.parse(JSON.stringify(obj));
}

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
      } catch (_) {}
    }
    return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function normalizeGalleryFields(product) {
  product.galleryImages = ensureStringArray(product.galleryImages);
  if (product.variantMedia && typeof product.variantMedia === "object" && !Array.isArray(product.variantMedia)) {
    Object.keys(product.variantMedia).forEach((key) => {
      const entry = product.variantMedia[key];
      if (entry && typeof entry === "object") {
        entry.galleryImages = ensureStringArray(entry.galleryImages);
        if (entry.mainImage == null) entry.mainImage = "";
        if (entry.video == null) entry.video = "";
      }
    });
  }
}

function sanitizeProductForRestore(obj) {
  const out = deepCloneProduct(obj);
  RESTORE_FORBIDDEN_KEYS.forEach((key) => delete out[key]);
  out.batchId = undefined;
  out.importDecision = undefined;
  REF_PATHS.forEach((pathKey) => {
    if (out[pathKey] != null) {
      const id = toRefId(out[pathKey]);
      out[pathKey] = id !== undefined ? id : undefined;
    }
  });
  REF_ARRAY_PATHS.forEach((pathKey) => {
    if (Array.isArray(out[pathKey])) {
      out[pathKey] = out[pathKey].map(toRefId).filter((id) => id != null);
    }
  });
  normalizeGalleryFields(out);
  return out;
}

async function restoreProducts(backupPath) {
  const raw = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  const products = raw.products;
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("Backup file has no products array");
  }

  const result = { inserted: 0, skipped: 0, failed: 0, errors: [] };

  for (let i = 0; i < products.length; i++) {
    const sanitized = sanitizeProductForRestore(products[i]);
    const sku = String(sanitized.sku || "").trim();
    if (!sku) {
      result.failed++;
      result.errors.push({ index: i, message: "Missing SKU" });
      continue;
    }

    const existing = await Product.findOne({ sku }).lean();
    if (existing) {
      result.skipped++;
      continue;
    }

    try {
      const doc = new Product(sanitized);
      const mixedPaths = ["variantPricing", "variantStock", "variantSku", "variantMedia", "variantDefinitions"];
      for (const mixedPath of mixedPaths) {
        if (sanitized[mixedPath] != null && typeof sanitized[mixedPath] === "object") {
          doc[mixedPath] = sanitized[mixedPath];
          doc.markModified(mixedPath);
        }
      }
      await doc.save();
      result.inserted++;
    } catch (err) {
      result.failed++;
      result.errors.push({ index: i, sku, message: err.message });
    }
  }

  return result;
}

async function main() {
  const backupPath = process.argv[2] || DEFAULT_BACKUP;
  if (!fs.existsSync(backupPath)) {
    console.error("Backup file not found:", backupPath);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Restoring from:", backupPath);

  const result = await restoreProducts(backupPath);
  const total = await Product.countDocuments();

  console.log("Restore result:", result);
  console.log("Total products in DB:", total);

  if (result.errors.length) {
    console.log("Errors:", result.errors.slice(0, 5));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
