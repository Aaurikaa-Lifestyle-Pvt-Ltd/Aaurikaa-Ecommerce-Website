/**
 * Shopper return request controller.
 * Handles: eligibility check, create request, get own request, evidence upload.
 */

const mongoose = require("mongoose");
const Order = require("../models/Order");
const {
  sendSellerReturnRequestSubmitted,
  sendShopperCaseSubmittedAcknowledgement,
} = require("../services/returnNotificationService");
const {
  getReturnEligibility,
  toShopperReturnEligibility,
} = require("../services/returnEligibilityService");
const {
  createReturnRequest,
  findExistingReturnRequest,
  toShopperReturnRequestDTO,
} = require("../services/returnRequestService");
const { resolveOrderReturnPolicy } = require("../utils/returnPolicyResolver");

const PRODUCT_POLICY_SELECT =
  "name slug mainImage sku seller returnPolicyMode returnAllowed returnWindowDays returnConditions";
const SELLER_POLICY_SELECT =
  "shopName shopUrl returnAllowed returnWindowDays returnConditions";

function isCastError(err) {
  return err && (err.name === "CastError" || err.kind === "ObjectId");
}

async function loadOrderForReturnPolicy(orderId, buyerId) {
  return Order.findOne({ _id: orderId, buyer: buyerId })
    .select("status buyer _id deliveredAt items")
    .populate({
      path: "items.product",
      select: PRODUCT_POLICY_SELECT,
      populate: { path: "seller", select: SELLER_POLICY_SELECT },
    })
    .lean();
}

function resolveEligibilityOptions(order) {
  const policy = resolveOrderReturnPolicy({ order });
  return {
    returnWindowDays: policy.returnWindowDays,
    returnAllowed: policy.returnAllowed,
    policy,
  };
}

/**
 * GET /api/shopper/orders/:id/return-eligibility
 * Read-only return eligibility check.
 */
exports.getReturnEligibility = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = await loadOrderForReturnPolicy(id, buyerId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const existing = await findExistingReturnRequest(id);
    const { returnWindowDays, returnAllowed, policy } = resolveEligibilityOptions(order);
    const eligibility = toShopperReturnEligibility(
      getReturnEligibility(order, existing, { returnWindowDays, returnAllowed })
    );
    const returnRequest = toShopperReturnRequestDTO(existing);

    return res.json({
      eligibility,
      returnRequest,
      returnPolicy: {
        returnAllowed: policy.returnAllowed,
        returnWindowDays: policy.returnWindowDays,
        source: policy.source,
      },
    });
  } catch (err) {
    if (isCastError(err)) {
      return res.status(404).json({ message: "Order not found" });
    }
    console.error("❌ Return eligibility error:", err);
    res.status(500).json({ message: "Failed to check return eligibility" });
  }
};

/**
 * POST /api/shopper/orders/:id/return-evidence
 * Upload Need Help evidence files (images/videos) to R2.
 */
exports.uploadReturnEvidence = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = await Order.findOne({ _id: id, buyer: buyerId })
      .select("_id status")
      .lean();

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const evidence = Array.isArray(req.uploadedEvidence) ? req.uploadedEvidence : [];
    if (evidence.length === 0) {
      return res.status(400).json({ message: "Please select at least one evidence file." });
    }

    return res.status(201).json({
      message: "Evidence uploaded successfully",
      evidence: evidence.map((item) => ({
        url: item.url,
        mediaType: item.mediaType,
        fileName: item.fileName || null,
        uploadedAt: item.uploadedAt
          ? new Date(item.uploadedAt).toISOString()
          : new Date().toISOString(),
      })),
    });
  } catch (err) {
    if (isCastError(err)) {
      return res.status(404).json({ message: "Order not found" });
    }
    console.error("❌ Return evidence upload error:", err);
    res.status(500).json({ message: "Failed to upload evidence" });
  }
};

/**
 * POST /api/shopper/orders/:id/return-request
 * Create a Need Help / return request for a delivered order.
 */
exports.createReturnRequest = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { id } = req.params;
    const {
      reasonCode,
      reasonText,
      issueCategory,
      description,
      evidence,
    } = req.body || {};

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = await loadOrderForReturnPolicy(id, buyerId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const { returnWindowDays, returnAllowed } = resolveEligibilityOptions(order);

    const result = await createReturnRequest({
      order,
      buyerId,
      reasonCode,
      reasonText,
      issueCategory,
      description,
      evidence,
      returnWindowDays,
      returnAllowed,
    });

    if (!result.success) {
      const statusCode = result.duplicate ? 409 : 400;
      const shopperEligibility = toShopperReturnEligibility(result.eligibility);
      return res.status(statusCode).json({
        message:
          shopperEligibility === result.eligibility
            ? result.error
            : shopperEligibility.message,
        eligibility: shopperEligibility,
      });
    }

    try {
      const orderForNotification = await Order.findById(order._id)
        .select("invoiceNumber billingDetails shippingDetails buyer items")
        .populate("buyer", "firstName lastName email")
        .lean();
      await Promise.all([
        sendSellerReturnRequestSubmitted(result.request, orderForNotification),
        sendShopperCaseSubmittedAcknowledgement(result.request, orderForNotification),
      ]);
    } catch (emailError) {
      console.error("Error sending return request notification emails:", emailError);
    }

    return res.status(201).json({
      message: "Help request submitted successfully",
      returnRequest: toShopperReturnRequestDTO(result.request),
      eligibility: toShopperReturnEligibility(result.eligibility),
    });
  } catch (err) {
    if (isCastError(err)) {
      return res.status(404).json({ message: "Order not found" });
    }
    console.error("❌ Return request create error:", err);
    res.status(500).json({ message: "Failed to submit help request" });
  }
};

/**
 * GET /api/shopper/orders/:id/return-request
 * Get the existing return request for a shopper's order.
 */
exports.getReturnRequest = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = await Order.findOne({ _id: id, buyer: buyerId })
      .select("status buyer _id")
      .lean();

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const existing = await findExistingReturnRequest(id);

    if (!existing) {
      return res.json({ returnRequest: null });
    }

    if (String(existing.buyer) !== String(buyerId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    return res.json({ returnRequest: toShopperReturnRequestDTO(existing) });
  } catch (err) {
    if (isCastError(err)) {
      return res.status(404).json({ message: "Order not found" });
    }
    console.error("❌ Get return request error:", err);
    res.status(500).json({ message: "Failed to fetch return request" });
  }
};

/**
 * POST /api/shopper/orders/:id/return-appeal
 * One-time appeal after seller resolution.
 */
exports.submitReturnAppeal = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { id } = req.params;
    const { reason, evidence } = req.body || {};

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = await Order.findOne({ _id: id, buyer: buyerId }).select("_id").lean();
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const existing = await findExistingReturnRequest(id);
    if (!existing) {
      return res.status(404).json({ message: "No after-sales case found for this order" });
    }

    const { submitShopperAppeal } = require("../services/returnAppealService");
    const { sendAdminCaseEscalation } = require("../services/returnNotificationService");

    const result = await submitShopperAppeal({
      requestId: existing._id,
      buyerId,
      reason,
      evidence,
    });

    if (result.invalid) {
      return res.status(400).json({ message: result.message });
    }
    if (result.notFound) {
      return res.status(404).json({ message: result.message || "After-sales case not found" });
    }
    if (result.notAllowed) {
      return res.status(400).json({ message: result.message });
    }
    if (result.conflict) {
      return res.status(409).json({ message: result.message });
    }

    try {
      await sendAdminCaseEscalation(result.request, id, {
        reason: "Shopper appealed seller resolution",
      });
    } catch (emailError) {
      console.error("Error sending appeal escalation email:", emailError);
    }

    return res.json({
      success: true,
      message: "Appeal submitted for admin review",
      returnRequest: toShopperReturnRequestDTO(result.request),
    });
  } catch (err) {
    if (isCastError(err)) {
      return res.status(404).json({ message: "Order not found" });
    }
    console.error("❌ Return appeal error:", err);
    res.status(500).json({ message: "Failed to submit appeal" });
  }
};
