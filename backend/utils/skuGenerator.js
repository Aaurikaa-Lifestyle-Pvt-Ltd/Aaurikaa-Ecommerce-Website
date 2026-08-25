// backend/utils/skuGenerator.js
const SkuRule = require("../models/SkuRule");
const Product = require("../models/Product");
const Brand = require("../models/brand");
const { getFeatureScalarValue } = require("./keyFeatureNormalization");

const VALID_SEGMENT_TYPES = [
    "category_name",
    "product_name",
    "quantity",
    "pack_size",
    "weight_number",
    "brand_name",
    "seller_shop_name",
    "regular_price",
    "sale_price",
];

const FALLBACK_SKU_PATTERN = /^[A-Z0-9]{1,8}-[A-Z0-9]{4}$/;

/**
 * Normalize a string value for SKU generation
 * - Uppercase
 * - Trim whitespace
 * - Replace spaces with underscores
 * - Remove non-alphanumeric characters (keep underscores)
 */
const normalizeValue = (text) => {
    if (!text) return "";
    return text
        .toString()
        .toUpperCase()
        .trim()
        .replace(/\s+/g, "_") // spaces to underscores
        .replace(/[^A-Z0-9_]/g, "") // remove non-alphanumeric (keep underscores)
        .replace(/_+/g, "_"); // replace multiple underscores with single
};

/**
 * Extract numeric value from text or number
 */
const extractNumeric = (value) => {
    if (typeof value === 'number') return value.toString();
    if (!value) return "";
    // Extract numbers and decimal point
    const match = value.toString().match(/[\d.]+/);
    return match ? match[0] : "";
};

/**
 * Build a plain product snapshot for deterministic SKU segment resolution.
 */
const buildSkuProductSnapshot = (product, brandDoc = null) => {
    if (!product) return null;

    const plain = typeof product.toObject === "function"
        ? product.toObject({ depopulate: false, virtuals: false })
        : { ...product };

    if (brandDoc && brandDoc.name) {
        plain.brand = { name: brandDoc.name };
    } else if (
        plain.brand &&
        typeof plain.brand === "object" &&
        typeof plain.brand.name === "string" &&
        plain.brand.name
    ) {
        plain.brand = { name: plain.brand.name };
    }

    return plain;
};

/**
 * Extract variant values for pack_size in stable variant-type order.
 */
const extractVariantPackValues = (variantCombination, variantValues) => {
    if (
        variantCombination &&
        typeof variantCombination === "object" &&
        !Array.isArray(variantCombination)
    ) {
        const keys = Object.keys(variantCombination).sort((a, b) =>
            String(a).localeCompare(String(b))
        );
        const values = keys
            .map((key) => variantCombination[key])
            .filter((value) => value !== null && value !== undefined && String(value).trim() !== "");
        if (values.length > 0) {
            return values;
        }
    }

    if (Array.isArray(variantValues) && variantValues.length > 0) {
        return variantValues.filter(
            (value) => value !== null && value !== undefined && String(value).trim() !== ""
        );
    }

    return [];
};

const buildFallbackSku = (product) => {
    let base = "";
    if (product && typeof product === "object") {
        base = normalizeValue(product.name || "item").substring(0, 8);
    } else {
        base = normalizeValue(product || "item").substring(0, 8);
    }
    if (!base) base = "ITEM";

    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${base}-${random}`;
};

const isFallbackSku = (sku) => FALLBACK_SKU_PATTERN.test(String(sku || "").trim());

/**
 * Generate a SKU based on the active rule and provided metadata
 * @param {Object} data - Metadata for SKU generation
 * @param {Array<string>} data.excludeSkus - SKUs to avoid (local to current product)
 */
const generateSku = async (data) => {
    const {
        product: rawProduct,
        category,
        seller,
        variantValues,
        variantCombination,
        excludeSkus = [],
    } = data;

    const product = buildSkuProductSnapshot(rawProduct);

    // Get active rule
    const rule = await SkuRule.findOne({ isActive: true });
    if (!rule) {
        return buildFallbackSku(product || rawProduct);
    }

    // Sort segments by order and filter enabled, rule-valid segments only
    const enabledSegments = (rule.segments || [])
        .filter(
            (seg) =>
                seg &&
                seg.enabled !== false &&
                VALID_SEGMENT_TYPES.includes(seg.type)
        )
        .sort((a, b) => (a.order || 0) - (b.order || 0));

    if (enabledSegments.length === 0) {
        return buildFallbackSku(product || rawProduct);
    }

    let skuParts = [];

    for (const segment of enabledSegments) {
        let rawValue = "";

        // Extract raw value based on segment type (data source only)
        switch (segment.type) {
            case "category_name":
                if (category) {
                    rawValue = typeof category === 'object' ? (category.name || "") : String(category);
                }
                break;

            case "product_name":
                if (product) {
                    if (typeof product === 'object') {
                        rawValue = product.name || "";
                    } else {
                        rawValue = String(product);
                    }
                }
                break;

            case "quantity":
                if (product && typeof product === 'object') {
                    rawValue = extractNumeric(product.stock || product.quantity || 0);
                }
                break;

            case "pack_size": {
                const packValues = extractVariantPackValues(variantCombination, variantValues);
                if (packValues.length > 0) {
                    rawValue = packValues.join(" ");
                    break;
                }
                if (product && typeof product === 'object') {
                    // Check features array
                    if (product.features && Array.isArray(product.features)) {
                        const packFeature = product.features.find(f =>
                            f.key && (f.key.toLowerCase().includes('pack') || f.key.toLowerCase().includes('size'))
                        );
                        const packValue = getFeatureScalarValue(packFeature);
                        if (packValue) {
                            rawValue = packValue;
                        }
                    }
                    // Fallback to shortDesc or longDesc if no pack info found
                    if (!rawValue) {
                        rawValue = product.shortDesc || product.longDesc || "";
                    }
                }
                break;
            }

            case "weight_number":
                if (product && typeof product === 'object') {
                    rawValue = extractNumeric(product.weight || 0);
                }
                break;

            case "brand_name":
                if (product && typeof product === 'object' && product.brand) {
                    // Populated brand doc has .name; unpopulated brand is an ObjectId (also typeof 'object' but no .name)
                    if (typeof product.brand === 'object' && typeof product.brand.name === 'string' && product.brand.name) {
                        rawValue = product.brand.name;
                    } else {
                        try {
                            const brandId = product.brand.toString ? product.brand.toString() : product.brand;
                            const brand = await Brand.findById(brandId);
                            rawValue = brand ? (brand.name || "") : "";
                        } catch (err) {
                            rawValue = "";
                        }
                    }
                }
                break;

            case "seller_shop_name":
                if (seller) {
                    if (typeof seller === 'object') {
                        rawValue = seller.shopName ||
                            (seller.firstName && seller.lastName ? `${seller.firstName} ${seller.lastName}`.trim() : "") ||
                            "";
                    } else {
                        rawValue = String(seller);
                    }
                } else if (product && typeof product === 'object' && product.sellerShop) {
                    if (typeof product.sellerShop === 'object') {
                        rawValue = product.sellerShop.shopName ||
                            (product.sellerShop.firstName && product.sellerShop.lastName ?
                                `${product.sellerShop.firstName} ${product.sellerShop.lastName}`.trim() : "") ||
                            "";
                    }
                }
                break;

            case "regular_price":
                if (product && typeof product === 'object') {
                    rawValue = extractNumeric(product.regularPrice || 0);
                }
                break;

            case "sale_price":
                if (product && typeof product === 'object') {
                    rawValue = extractNumeric(product.salePrice || product.regularPrice || 0);
                }
                break;

            default:
                rawValue = "";
                break;
        }

        // Normalize the raw value
        let normalizedValue = normalizeValue(rawValue);

        // Apply length (truncate or pad). Only pad when we had actual content; empty stays empty so segment can be omitted.
        if (segment.length && normalizedValue.length > 0) {
            if (normalizedValue.length > segment.length) {
                normalizedValue = normalizedValue.substring(0, segment.length);
            } else if (normalizedValue.length < segment.length) {
                const isNumeric = /^\d+$/.test(normalizedValue.replace(/_/g, ""));
                if (isNumeric) {
                    normalizedValue = normalizedValue.replace(/_/g, "").padStart(segment.length, "0");
                } else {
                    normalizedValue = normalizedValue.padEnd(segment.length, "X");
                }
            }
        }

        // Apply prefix and suffix
        let finalPart = normalizedValue;
        if (segment.prefix) {
            finalPart = segment.prefix + finalPart;
        }
        if (segment.suffix) {
            finalPart = finalPart + segment.suffix;
        }

        // Only add non-empty parts
        if (finalPart) {
            skuParts.push(finalPart);
        }
    }

    let generatedSku = skuParts.join(rule.separator || "-");

    // Filter allowed characters
    if (rule.allowedCharacters) {
        const regex = new RegExp(`[^${rule.allowedCharacters}]`, "g");
        generatedSku = generatedSku.replace(regex, "");
    }

    // Fallback only when rule assembly genuinely produced no output
    if (!generatedSku || generatedSku.trim() === "") {
        generatedSku = buildFallbackSku(product || rawProduct);
    }

    // Collision detection and resolution
    let finalSku = generatedSku;
    let counter = 1;
    let collision = true;

    while (collision) {
        // Check against local excluded SKUs
        if (excludeSkus.includes(finalSku)) {
            finalSku = `${generatedSku}${rule.separator || "-"}${counter}`;
            counter++;
            continue;
        }

        // Check base SKU in DB
        const existingBase = await Product.findOne({ sku: finalSku });
        if (existingBase) {
            finalSku = `${generatedSku}${rule.separator || "-"}${counter}`;
            counter++;
            continue;
        }

        // Check variant SKUs in DB using aggregation to avoid $where (forbidden in some Atlas tiers)
        const variantExists = await Product.aggregate([
            { $match: { variantSku: { $exists: true } } },
            {
                $project: {
                    matches: {
                        $filter: {
                            input: { $objectToArray: "$variantSku" },
                            as: "item",
                            cond: { $eq: ["$$item.v", finalSku] }
                        }
                    }
                }
            },
            { $match: { "matches.0": { $exists: true } } },
            { $limit: 1 }
        ]);

        if (variantExists && variantExists.length > 0) {
            finalSku = `${generatedSku}${rule.separator || "-"}${counter}`;
            counter++;
        } else {
            collision = false;
        }
    }

    return finalSku;
};

module.exports = {
    generateSku,
    buildSkuProductSnapshot,
    isFallbackSku,
    VALID_SEGMENT_TYPES,
};
