const mongoose = require("mongoose");
const Product = require("../models/Product");
const Shopper = require("../models/Shopper");
const StockNotificationRequest = require("../models/StockNotificationRequest");
const sendMail = require("../utils/sendMail");
const {
  normalizeVariantCombination,
  getVariantStock,
  productHasVariants,
  validateVariantCombination,
} = require("../utils/variantUtils");

const PRODUCT_SELECT =
  "name slug status approvalStatus stock variants variantStock mainImage regularPrice salePrice";

function resolveVariantKey(variantCombination) {
  if (!variantCombination || typeof variantCombination !== "object") {
    return null;
  }
  if (Object.keys(variantCombination).length === 0) {
    return null;
  }
  return normalizeVariantCombination(variantCombination) || null;
}

function getAvailableStock(product, variantCombination) {
  if (!product) return 0;

  const hasVariants = productHasVariants(product);
  if (hasVariants) {
    if (!variantCombination || typeof variantCombination !== "object") {
      return 0;
    }
    const variantStock = getVariantStock(product, variantCombination);
    return variantStock === null ? 0 : Math.max(0, Number(variantStock) || 0);
  }

  return Math.max(0, Number(product.stock) || 0);
}

function isProductAvailableForPurchase(product) {
  return product?.status === "published" && product?.approvalStatus === "approved";
}

function buildProductUrl(product) {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const slug = product?.slug || product?._id;
  return `${baseUrl}/products/${slug}`;
}

function formatVariantLabel(variantCombination) {
  if (!variantCombination || typeof variantCombination !== "object") {
    return "";
  }
  const parts = Object.entries(variantCombination).map(([key, value]) => `${key}: ${value}`);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

async function sendRestockEmail({ shopper, product, variantCombination }) {
  const productName = product.name || "Product";
  const variantLabel = formatVariantLabel(variantCombination);
  const productUrl = buildProductUrl(product);
  const shopperName = [shopper.firstName, shopper.lastName].filter(Boolean).join(" ") || "there";

  const subject = `${productName} is back in stock`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #047857; margin: 0;">Back in stock</h2>
        <p style="margin: 10px 0 0 0; color: #065f46;">Good news — an item you requested is available again.</p>
      </div>
      <div style="background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px;">
        <p>Hello ${shopperName},</p>
        <p><strong>${productName}</strong>${variantLabel} is back in stock on AAURIKAA.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${productUrl}"
             style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            View product
          </a>
        </div>
      </div>
    </div>
  `;

  await sendMail(shopper.email, subject, html);
}

/**
 * Create a back-in-stock notification request for an authenticated shopper.
 */
async function createStockNotificationRequest({ shopperId, productId, variantCombination }) {
  if (!mongoose.Types.ObjectId.isValid(shopperId)) {
    return { success: false, statusCode: 400, message: "Invalid shopper." };
  }

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return { success: false, statusCode: 400, message: "Invalid product ID." };
  }

  const shopper = await Shopper.findById(shopperId).select("email firstName lastName");
  if (!shopper) {
    return { success: false, statusCode: 404, message: "Shopper not found." };
  }

  const product = await Product.findById(productId).select(PRODUCT_SELECT);
  if (!product) {
    return { success: false, statusCode: 404, message: "Product not found." };
  }

  if (!isProductAvailableForPurchase(product)) {
    return { success: false, statusCode: 400, message: "Product is not available for notifications." };
  }

  const hasVariants = productHasVariants(product);
  let normalizedVariantCombination = undefined;
  let variantKey = null;

  if (hasVariants) {
    if (!variantCombination || typeof variantCombination !== "object" || Object.keys(variantCombination).length === 0) {
      return { success: false, statusCode: 400, message: "Variant selection is required for this product." };
    }

    const validation = validateVariantCombination(product, variantCombination);
    if (!validation.valid) {
      return { success: false, statusCode: 400, message: validation.error || "Invalid variant selection." };
    }

    normalizedVariantCombination = variantCombination;
    variantKey = resolveVariantKey(variantCombination);
    if (!variantKey) {
      return { success: false, statusCode: 400, message: "Invalid variant selection." };
    }
  } else if (variantCombination && Object.keys(variantCombination).length > 0) {
    return { success: false, statusCode: 400, message: "This product does not support variant selection." };
  }

  const availableStock = getAvailableStock(product, normalizedVariantCombination);
  if (availableStock > 0) {
    return { success: false, statusCode: 400, message: "Product is already in stock." };
  }

  const duplicateQuery = {
    shopper: shopperId,
    product: productId,
    status: "pending",
    variantKey: variantKey ?? null,
  };

  const existing = await StockNotificationRequest.findOne(duplicateQuery).lean();
  if (existing) {
    return {
      success: true,
      statusCode: 200,
      alreadyExists: true,
      requestId: String(existing._id),
      message: "You are already subscribed for this item.",
    };
  }

  try {
    const request = await StockNotificationRequest.create({
      shopper: shopperId,
      product: productId,
      variantCombination: normalizedVariantCombination,
      variantKey,
      status: "pending",
    });

    return {
      success: true,
      statusCode: 201,
      alreadyExists: false,
      requestId: String(request._id),
      message: "We will notify you when this item is back in stock.",
    };
  } catch (err) {
    if (err && err.code === 11000) {
      const duplicate = await StockNotificationRequest.findOne(duplicateQuery).lean();
      return {
        success: true,
        statusCode: 200,
        alreadyExists: true,
        requestId: duplicate ? String(duplicate._id) : undefined,
        message: "You are already subscribed for this item.",
      };
    }
    throw err;
  }
}

/**
 * Process pending notification requests for a product after stock may have changed.
 */
async function processRestockNotificationsForProduct(productId) {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return { processed: 0, notified: 0 };
  }

  const pendingCount = await StockNotificationRequest.countDocuments({
    product: productId,
    status: "pending",
  });

  if (pendingCount === 0) {
    return { processed: 0, notified: 0 };
  }

  const product = await Product.findById(productId).select(PRODUCT_SELECT);
  if (!product || !isProductAvailableForPurchase(product)) {
    return { processed: 0, notified: 0 };
  }

  const pendingRequests = await StockNotificationRequest.find({
    product: productId,
    status: "pending",
  })
    .populate("shopper", "email firstName lastName")
    .lean();

  let notified = 0;

  for (const request of pendingRequests) {
    const variantCombination = request.variantCombination || undefined;
    const availableStock = getAvailableStock(product, variantCombination);

    if (availableStock <= 0) {
      continue;
    }

    const shopper = request.shopper;
    if (!shopper?.email) {
      continue;
    }

    try {
      await sendRestockEmail({ shopper, product, variantCombination });
      await StockNotificationRequest.updateOne(
        { _id: request._id, status: "pending" },
        { $set: { status: "notified", notifiedAt: new Date() } }
      );
      notified += 1;
    } catch (err) {
      console.error("❌ Restock notification failed:", err.message);
    }
  }

  return { processed: pendingRequests.length, notified };
}

/**
 * List active stock notification requests (admin visibility).
 */
async function listStockNotificationRequests({ status = "pending", page = 1, limit = 20 }) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (safePage - 1) * safeLimit;

  const filter = {};
  if (status) {
    filter.status = status;
  }

  const [requests, totalCount] = await Promise.all([
    StockNotificationRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate("shopper", "firstName lastName email")
      .populate("product", "name slug sku stock")
      .lean(),
    StockNotificationRequest.countDocuments(filter),
  ]);

  return {
    requests,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages: Math.ceil(totalCount / safeLimit) || 1,
    },
  };
}

module.exports = {
  createStockNotificationRequest,
  processRestockNotificationsForProduct,
  listStockNotificationRequests,
  getAvailableStock,
  resolveVariantKey,
};
