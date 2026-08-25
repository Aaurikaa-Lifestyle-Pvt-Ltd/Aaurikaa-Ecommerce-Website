// backend/utils/productExportService.js
const XLSX = require('xlsx');
const { resolvePublicUrl } = require('./mediaUrlUtils');
const { CONTRACT_VERSION } = require('./productImportExport/constants');
const {
  CATALOGUE_CSV_COLUMNS,
  buildCatalogueExportRows,
  pickCatalogueRowFields,
} = require('./productCatalogueContract');

const MARKETPLACE_PRODUCT_COLUMNS = ['sellerShopName', 'sellerName'];

function omitMarketplaceProductColumns(headersOrRow) {
    if (Array.isArray(headersOrRow)) {
        return headersOrRow.filter((key) => !MARKETPLACE_PRODUCT_COLUMNS.includes(key));
    }
    if (!headersOrRow || typeof headersOrRow !== 'object') return headersOrRow;
    const next = { ...headersOrRow };
    MARKETPLACE_PRODUCT_COLUMNS.forEach((key) => {
        delete next[key];
    });
    return next;
}

function buildProductExportRows(products, { operator = false } = {}) {
    if (!products || !Array.isArray(products)) return [];

    const rows = products.map(p => {
        // 1. Force String Casting for Identifiers/Strings (Rule 1)
        const castToString = (val) => (val === null || val === undefined) ? "" : String(val);

        // 2. Normalize Boolean Fields Explicitly (Rule 2)
        const normalizeBool = (val) => (val === true) ? "TRUE" : "FALSE";

        // 3. Price & Quantity Fields: Enforce Number or Blank (Rule 3)
        const normalizeNum = (val) => {
            if (val === null || val === undefined || val === "" || isNaN(Number(val))) return "";
            return Number(val);
        };

        // 4. Serialize Complex Fields Deterministically (Rule 5)
        const serializeComplex = (val) => {
            if (!val || (Array.isArray(val) && val.length === 0)) return "[]";
            try {
                return JSON.stringify(val);
            } catch (e) {
                return "[]";
            }
        };

        // Process Gallery Images: comma-separated format to match CSV import (round-trip consistency)
        const galleryUrls = Array.isArray(p.galleryImages)
            ? p.galleryImages.map((img) => resolvePublicUrl(img) || img)
            : (p.galleryImages ? [resolvePublicUrl(p.galleryImages) || p.galleryImages] : []);

        const serializeMixed = (val) => {
            if (val === null || val === undefined) return "";
            if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) return "";
            try {
                return JSON.stringify(val);
            } catch (e) {
                return "";
            }
        };

        const row = {
            contractVersion: CONTRACT_VERSION,
            // Mandatory Identity Fields (Rule 4)
            name: p.name || "Untitled Product",
            status: p.status || "draft",
            approvalStatus: p.approvalStatus || "",

            // Identifiers (Rule 1)
            sku: castToString(p.sku),
            hsnCode: castToString(p.hsnCode),

            // Boolean Fields (Rule 2)
            isFeatured: normalizeBool(p.isFeatured),
            taxIncluded: normalizeBool(p.taxIncluded),
            hasVariants: normalizeBool(p.variants && p.variants.length > 0),

            // Numbers (Rule 3)
            regularPrice: normalizeNum(p.regularPrice),
            salePrice: normalizeNum(p.salePrice),
            stock: normalizeNum(p.stock),
            weight: normalizeNum(p.weight),
            length: normalizeNum(p.length),
            width: normalizeNum(p.width),
            height: normalizeNum(p.height),
            taxRate: normalizeNum(p.taxRate),

            // Relations (Strings)
            brand: castToString(p.brand?.name || p.brand?.slug),
            category: castToString(p.category?.name || p.category?.slug),
            subcategory: castToString(p.subcategory?.name || p.subcategory?.slug),
            childCategory: castToString(p.childCategory?.name || p.childCategory?.slug),
            // Shipping Slab — WeightClass name only (never ObjectId)
            weightClass: castToString(
              p.weightClass && typeof p.weightClass === "object" ? p.weightClass.name : ""
            ),

            // Seller Fields (flat, from populated seller)
            sellerShopName: castToString(p.seller?.shopName),
            sellerName: castToString([p.seller?.firstName, p.seller?.lastName].filter(Boolean).join(" ")),

            // Description Fields
            shortDesc: castToString(p.shortDesc),
            longDesc: castToString(p.longDesc),

            // Complex Fields (Rule 5)
            variants: serializeComplex(p.variants),
            variantPricing: serializeMixed(p.variantPricing),
            variantStock: serializeMixed(p.variantStock),
            variantSku: serializeMixed(p.variantSku),
            variantMedia: serializeMixed(p.variantMedia),
            features: serializeComplex(p.features),
            usageInstructions: serializeComplex(p.usageInstructions),
            featuresContent: castToString(p.featuresContent),
            usageSafetyContent: castToString(p.usageSafetyContent),
            qandas: serializeComplex(p.qandas),
            bulkDiscount: p.bulkDiscount?.enabled ? serializeComplex(p.bulkDiscount) : "{}",
            galleryImages: galleryUrls.length ? galleryUrls.join(", ") : "",

            // Comma Separated Strings (Rule 1 - Identifier-like lists)
            tags: Array.isArray(p.tags) ? p.tags.join(", ") : castToString(p.tags),
            secondaryCategories: (() => {
              if (!Array.isArray(p.secondaryCategories) || p.secondaryCategories.length === 0) {
                return "[]";
              }
              const paths = p.secondaryCategories
                .map((path) => ({
                  category: castToString(path?.category?.name || path?.category?.slug || ""),
                  subcategory: castToString(
                    path?.subcategory?.name || path?.subcategory?.slug || ""
                  ),
                  childCategory: castToString(
                    path?.childCategory?.name || path?.childCategory?.slug || ""
                  ),
                }))
                .filter((path) => path.category);
              return serializeComplex(paths);
            })(),
            upsellSkus: Array.isArray(p.upsellSkus) ? p.upsellSkus.join(", ") : castToString(p.upsellSkus),
            crossSellSkus: Array.isArray(p.crossSellSkus) ? p.crossSellSkus.join(", ") : castToString(p.crossSellSkus),
            boughtTogetherSkus: Array.isArray(p.boughtTogetherSkus) ? p.boughtTogetherSkus.join(", ") : castToString(p.boughtTogetherSkus),

            // Others (obsolete shippingApplicability / shippingType / shippingVisibility / shippingCharge omitted)
            deliveryTime: castToString(p.deliveryTime),
            returnPolicyMode: castToString(p.returnPolicyMode || "inherit"),
            returnAllowed:
              p.returnAllowed === null || p.returnAllowed === undefined
                ? ""
                : String(Boolean(p.returnAllowed)),
            returnWindowDays:
              p.returnWindowDays === null || p.returnWindowDays === undefined
                ? ""
                : String(p.returnWindowDays),
            genuineProduct: normalizeBool(p.genuineProduct),
            warrantyAvailable: normalizeBool(p.warranty?.available),
            warrantyDuration: castToString(p.warranty?.duration),
            warrantyCoverage: castToString(p.warranty?.coverage),
            warrantyTerms: castToString(p.warranty?.terms),
            manufacturerSummary: castToString(p.manufacturerConditions?.summary),
            manufacturerDetails: castToString(p.manufacturerConditions?.details),
            "seo.primaryKeyword": castToString(p.seo?.primaryKeyword),
            metaTitle: castToString(p.metaTitle),
            metaDescription: castToString(p.metaDescription),
            metaKeywords: castToString(p.metaKeywords),

            // Media URLs (Main Image is single string)
            mainImage: p.mainImage ? (resolvePublicUrl(p.mainImage) || p.mainImage) : "",
            video: p.video ? (resolvePublicUrl(p.video) || p.video) : ""
        };

        // Final Safety Pass (Rule 6)
        Object.keys(row).forEach(key => {
            const val = row[key];
            if (val === null || val === undefined || (typeof val === "number" && isNaN(val))) {
                row[key] = "";
            }
        });

        return operator ? omitMarketplaceProductColumns(row) : row;
    });

    return rows;
}

function buildOperatorExportRows(products) {
    const catalogueRows = buildCatalogueExportRows(products);
    return catalogueRows.map(pickCatalogueRowFields);
}

/**
 * Format product data for CSV export with symmetry and contractual compliance.
 * @param {Array} products - Populated product objects from database
 * @param {{ operator?: boolean }} [options]
 * @returns {string} - CSV content
 */
exports.formatProductsForExport = (products, options = {}) => {
    const rows = options.operator
        ? buildOperatorExportRows(products)
        : buildProductExportRows(products, options);
    if (!rows.length) return "";
    const worksheet = XLSX.utils.json_to_sheet(rows, {
        header: options.operator ? CATALOGUE_CSV_COLUMNS : undefined,
    });
    return XLSX.utils.sheet_to_csv(worksheet);
};

/**
 * Same contract rows as CSV, as an .xlsx buffer.
 * @param {Array} products
 * @param {{ operator?: boolean }} [options]
 * @returns {Buffer}
 */
exports.formatProductsForExportXlsx = (products, options = {}) => {
    const rows = options.operator
        ? buildOperatorExportRows(products)
        : buildProductExportRows(products, options);
    const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [], {
        header: options.operator ? CATALOGUE_CSV_COLUMNS : undefined,
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

exports.buildProductExportRows = buildProductExportRows;
exports.buildOperatorExportRows = buildOperatorExportRows;
exports.omitMarketplaceProductColumns = omitMarketplaceProductColumns;
exports.MARKETPLACE_PRODUCT_COLUMNS = MARKETPLACE_PRODUCT_COLUMNS;
