/**
 * Admin product write adapter.
 *
 * Seller ownership is resolved by the backend (WS1A). This payload must never
 * include sellerId, sellerShop, or shopName.
 * Product-level SEO fields are echoed on save (no Product SEO UI here).
 * Operators edit product meta via /admin/seo; site-level SEO is also there.
 */

import type {
  AdminManufacturerConditions,
  AdminProductFeature,
  AdminProductQanda,
  AdminProductUsageInstruction,
  AdminProductVariantAxis,
} from "@/types/admin";
import {
  narrativeRichTextForWrite,
  richTextToPlainText,
} from "../rich-text/rich-text-utils.ts";

export type ProductMediaSlot = {
  url?: string;
  mediaId?: string;
  file?: File | null;
};

/** Care / features narrative are plain text (not TipTap JSON). */
function plainFactualForWrite(content: unknown): string {
  return richTextToPlainText(String(content ?? "")).trim();
}

function normalizeManufacturerForWrite(
  raw: AdminManufacturerConditions,
): AdminManufacturerConditions {
  return {
    summary: String(raw.summary ?? "").trim(),
    // Manufacturer Details uses ProductStructuredEditor (TipTap JSON).
    details: narrativeRichTextForWrite(raw.details),
    countryOfOrigin: String(raw.countryOfOrigin ?? "").trim(),
    marketedBy: String(raw.marketedBy ?? "").trim(),
    grievanceRedressal: String(raw.grievanceRedressal ?? "").trim(),
  };
}

export type AdminProductWriteInput = {
  name: string;
  sku?: string;
  regularPrice: number | string;
  salePrice?: number | string;
  stock?: number | string;
  category?: string;
  subcategory?: string;
  childCategory?: string;
  /**
   * Optional brand ObjectId.
   * - undefined: omit field (create: no brand; update: leave unchanged)
   * - "": clear brand on update (backend sets null when `brand` key is present)
   * - ObjectId string: set/replace brand
   */
  brand?: string;
  weightClass?: string;
  status?: string;
  shortDesc?: string;
  longDesc?: string;
  length?: number | string;
  width?: number | string;
  height?: number | string;
  weight?: number | string;
  featuresContent?: string;
  usageSafetyContent?: string;
  usageInstructions?: AdminProductUsageInstruction[];
  manufacturerConditions?: AdminManufacturerConditions;
  features?: AdminProductFeature[];
  qandas?: AdminProductQanda[];
  variants?: AdminProductVariantAxis[];
  variantPricing?: Record<string, { price?: number; salePrice?: number }>;
  variantStock?: Record<string, number>;
  variantSku?: Record<string, string>;
  variantMedia?: Record<
    string,
    { mainImage?: string; galleryImages?: string[]; video?: string }
  >;
  variantMediaFiles?: Record<
    string,
    { mainImage?: File | null; video?: File | null; galleryImages?: File[] }
  >;
  mainImage?: ProductMediaSlot;
  galleryImages?: ProductMediaSlot[];
  video?: ProductMediaSlot;
  /** When true, send empty gallery to clear. */
  clearGallery?: boolean;
  clearMainImage?: boolean;
  clearVideo?: boolean;
  /**
   * GST %. Use 0 (or omit) for category hierarchy fallback.
   * Values > 0 are product overrides for gstEngineService.
   */
  taxRate?: number | string;
  taxIncluded?: boolean;
  hsnCode?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  /** Flat field; backend create/update/autosave merge into seo.primaryKeyword. */
  primaryKeyword?: string;
};

const FORBIDDEN_OWNERSHIP_KEYS = ["sellerId", "seller", "sellerShop", "shopName"] as const;

function appendJson(body: FormData, key: string, value: unknown) {
  body.append(key, JSON.stringify(value));
}

export function buildAdminProductWriteBody(input: AdminProductWriteInput): FormData {
  const body = new FormData();
  body.append("name", input.name.trim());
  body.append("regularPrice", String(input.regularPrice ?? ""));
  if (input.salePrice !== undefined && input.salePrice !== "") {
    body.append("salePrice", String(input.salePrice));
  }
  if (input.stock !== undefined && input.stock !== "") {
    body.append("stock", String(input.stock));
  }
  if (input.sku) body.append("sku", input.sku);
  if (input.category) body.append("category", input.category);
  if (input.subcategory) body.append("subcategory", input.subcategory);
  if (input.childCategory) body.append("childCategory", input.childCategory);
  if (input.brand !== undefined) body.append("brand", input.brand);
  if (input.weightClass) body.append("weightClass", input.weightClass);
  if (input.status) body.append("status", input.status);
  if (input.shortDesc !== undefined) {
    body.append("shortDesc", narrativeRichTextForWrite(input.shortDesc));
  }
  if (input.longDesc !== undefined) {
    body.append("longDesc", narrativeRichTextForWrite(input.longDesc));
  }
  if (input.length !== undefined && input.length !== "") {
    body.append("length", String(input.length));
  }
  if (input.width !== undefined && input.width !== "") {
    body.append("width", String(input.width));
  }
  if (input.height !== undefined && input.height !== "") {
    body.append("height", String(input.height));
  }
  if (input.weight !== undefined && input.weight !== "") {
    body.append("weight", String(input.weight));
  }
  if (input.featuresContent !== undefined) {
    body.append("featuresContent", plainFactualForWrite(input.featuresContent));
  }
  if (input.usageSafetyContent !== undefined) {
    body.append(
      "usageSafetyContent",
      narrativeRichTextForWrite(input.usageSafetyContent),
    );
  }
  if (input.usageInstructions !== undefined) {
    appendJson(body, "usageInstructions", input.usageInstructions);
  }
  if (input.manufacturerConditions !== undefined) {
    appendJson(
      body,
      "manufacturerConditions",
      normalizeManufacturerForWrite(input.manufacturerConditions),
    );
  }
  if (input.metaTitle !== undefined) body.append("metaTitle", input.metaTitle);
  if (input.metaDescription !== undefined) {
    body.append("metaDescription", input.metaDescription);
  }
  if (input.metaKeywords !== undefined) {
    body.append("metaKeywords", input.metaKeywords);
  }
  if (input.primaryKeyword !== undefined) {
    body.append("primaryKeyword", input.primaryKeyword);
  }
  if (input.taxRate !== undefined) {
    // 0 = use category hierarchy (gstEngineService product override only when > 0)
    body.append("taxRate", String(Number(input.taxRate) || 0));
  }
  if (input.taxIncluded !== undefined) {
    body.append("taxIncluded", input.taxIncluded ? "true" : "false");
  }
  if (input.hsnCode !== undefined) {
    body.append("hsnCode", input.hsnCode.trim());
  }
  if (input.features !== undefined) appendJson(body, "features", input.features);
  if (input.qandas !== undefined) appendJson(body, "qandas", input.qandas);
  if (input.variants !== undefined) appendJson(body, "variants", input.variants);
  if (input.variantPricing !== undefined) {
    appendJson(body, "variantPricing", input.variantPricing);
  }
  if (input.variantStock !== undefined) appendJson(body, "variantStock", input.variantStock);
  if (input.variantSku !== undefined) appendJson(body, "variantSku", input.variantSku);
  if (input.variantMedia !== undefined) appendJson(body, "variantMedia", input.variantMedia);

  // Main image: direct file upload and/or gallery selection
  if (input.clearMainImage) {
    body.append("mainImage", "");
  } else if (input.mainImage?.file) {
    body.append("mainImage", input.mainImage.file);
  } else if (input.mainImage?.url) {
    body.append("mainImage", input.mainImage.url);
  }
  if (input.mainImage?.mediaId) body.append("mainImageId", input.mainImage.mediaId);

  // Gallery images
  if (input.clearGallery) {
    body.append("galleryImages", "");
  } else if (input.galleryImages) {
    const urls: string[] = [];
    const ids: string[] = [];
    for (const slot of input.galleryImages) {
      if (slot.file) body.append("galleryImages", slot.file);
      else if (slot.url) urls.push(slot.url);
      if (slot.mediaId) ids.push(slot.mediaId);
    }
    if (urls.length > 0) body.append("galleryImages", urls.join(","));
    if (ids.length > 0) appendJson(body, "galleryImageIds", ids);
  }

  // Video
  if (input.clearVideo) {
    body.append("video", "");
  } else if (input.video?.file) {
    body.append("video", input.video.file);
  } else if (input.video?.url) {
    body.append("video", input.video.url);
  }
  if (input.video?.mediaId) body.append("videoId", input.video.mediaId);

  // Variant media file uploads
  if (input.variantMediaFiles) {
    for (const [variantKey, files] of Object.entries(input.variantMediaFiles)) {
      if (files.mainImage) {
        body.append(`variantMedia-${variantKey}-mainImage`, files.mainImage);
      }
      if (files.video) {
        body.append(`variantMedia-${variantKey}-video`, files.video);
      }
      if (files.galleryImages) {
        for (const file of files.galleryImages) {
          body.append(`variantMedia-${variantKey}-galleryImages`, file);
        }
      }
    }
  }

  return body;
}

export function writeBodyHasSellerSelection(body: FormData): boolean {
  for (const key of FORBIDDEN_OWNERSHIP_KEYS) {
    if (body.has(key)) return true;
  }
  return false;
}

export { FORBIDDEN_OWNERSHIP_KEYS };
