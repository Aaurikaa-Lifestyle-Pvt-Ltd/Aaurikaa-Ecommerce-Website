const Order = require("../models/Order");
const ReturnRequest = require("../models/ReturnRequest");
const {
  parsePaginationQuery,
  shopperOrderListDTO,
} = require("../services/shopperOrderListService");
const { shopperOrderDetailDTO } = require("../services/shopperOrderDetailService");
const { loadReviewedProductIds } = require("../services/reviewEligibilityService");
const { processBuyAgain } = require("../services/buyAgainService");
const {
  getCancellationEligibility,
  validateCancellationReason,
} = require("../services/cancellationEligibilityService");
const { buildShopperVisibleOrderFilter } = require("../services/orderArchiveVisibilityService");
const {
  buildManualConfirmationMap,
  isManualConfirmationEligible,
  toShopperManualConfirmationDTO,
} = require("../services/manualConfirmationService");
const {
  findExistingReturnRequest,
  toShopperReturnRequestDTO,
} = require("../services/returnRequestService");
const { resolveOrderReturnPolicy } = require("../utils/returnPolicyResolver");
const { onOrderCancelled } = require("../services/orderCommerceIntegrityService");

const LIST_SELECT =
  "invoiceNumber status deliveredAt totalAmount paymentMethod paymentStatus paymentTransactionId paymentDetails upiTxnId createdAt updatedAt items trackingNumber shiprocketShipments shiprocketOrderId buyer manualConfirmationStatus manualConfirmationEligible";

const DETAIL_SELECT =
  "invoiceNumber status deliveredAt totalAmount paymentMethod paymentStatus paymentTransactionId paymentDetails upiTxnId createdAt updatedAt items trackingNumber shiprocketShipments shiprocketOrderId buyer shippingCharge bulkDiscountSummary coupon tax billingDetails shippingDetails shippingApplicability shippableItemCount nonShippableItemCount manualConfirmationStatus manualConfirmationEligible fulfilmentKind sourceOrder sourceReturnRequest";

const PRODUCT_POPULATE_SELECT =
  "name slug mainImage sku seller returnPolicyMode returnAllowed returnWindowDays returnConditions";
const SELLER_POPULATE_SELECT =
  "shopName shopUrl returnAllowed returnWindowDays returnConditions";

function resolveOrderEligibilityOptions(order) {
  const policy = resolveOrderReturnPolicy({ order });
  return {
    returnWindowDays: policy.returnWindowDays,
    returnAllowed: policy.returnAllowed,
  };
}

/**
 * GET /api/shopper/orders — authoritative paginated shopper order listing (DTO).
 * Also mounted at GET /api/shopper/orders via shopperRoutes for backward compatibility.
 */
exports.listShopperOrders = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { page, limit, skip } = parsePaginationQuery(req.query);

    const filter = buildShopperVisibleOrderFilter(buyerId);

    const [totalCount, orders] = await Promise.all([
      Order.countDocuments(filter),
      Order.find(filter)
        .select(LIST_SELECT)
        .populate({
          path: "items.product",
          select: PRODUCT_POPULATE_SELECT,
          populate: { path: "seller", select: SELLER_POPULATE_SELECT },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / limit);

    const manualConfirmationMap = await buildManualConfirmationMap(orders, buyerId);

    const orderIds = orders.map((o) => o._id);
    const returnRequests =
      orderIds.length > 0
        ? await ReturnRequest.find({ order: { $in: orderIds } })
            .select(
              "order buyer status caseFlow resolution returnRequired reasonCode reasonText issueCategory evidence createdAt updatedAt returnReviewedAt refundReviewedAt refundCompletedAt walletCreditProcessedAt walletCreditAmount appeal resolutionReasonCode"
            )
            .sort({ createdAt: -1 })
            .lean()
        : [];
    const returnRequestMap = new Map();
    for (const rr of returnRequests) {
      const key = String(rr.order);
      if (!returnRequestMap.has(key)) {
        returnRequestMap.set(key, rr);
      }
    }

    const productIds = orders.flatMap((order) =>
      (order.items || [])
        .map((item) => item.product?._id || item.product)
        .filter(Boolean)
    );
    const reviewedProductIds = await loadReviewedProductIds({
      shopperId: buyerId,
      productIds,
    });

    res.json({
      orders: orders.map((order) => {
        const existingReturnRequest = returnRequestMap.get(String(order._id)) || null;
        const eligibilityOptions = resolveOrderEligibilityOptions(order);
        return shopperOrderListDTO(order, {
          shopperId: buyerId,
          reviewedProductIds,
          manualConfirmation: manualConfirmationMap.get(String(order._id)),
          existingReturnRequest,
          returnRequest: toShopperReturnRequestDTO(existingReturnRequest),
          ...eligibilityOptions,
        });
      }),
      pagination: {
        page,
        limit,
        totalPages,
        totalCount,
      },
    });
  } catch (err) {
    console.error("❌ Error fetching shopper orders:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

/**
 * GET /api/shopper/orders/:id — normalized shopper order detail (DTO).
 */
exports.getShopperOrderDetail = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { id } = req.params;

    const [order] = await Promise.all([
      Order.findOne({ _id: id, buyer: buyerId })
        .select(DETAIL_SELECT)
        .populate({
          path: "items.product",
          select: PRODUCT_POPULATE_SELECT,
          populate: { path: "seller", select: SELLER_POPULATE_SELECT },
        })
        .lean(),
    ]);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const productIds = (order.items || [])
      .map((item) => item.product?._id || item.product)
      .filter(Boolean);

    const reviewedProductIds = await loadReviewedProductIds({
      shopperId: buyerId,
      productIds,
    });

    const eligible = await isManualConfirmationEligible(order, buyerId);
    const manualConfirmation = toShopperManualConfirmationDTO(order, { eligible });

    const existingReturnRequest = await findExistingReturnRequest(id);
    const eligibilityOptions = resolveOrderEligibilityOptions(order);

    res.json({
      order: shopperOrderDetailDTO(order, {
        shopperId: buyerId,
        reviewedProductIds,
        manualConfirmation,
        existingReturnRequest,
        returnRequest: toShopperReturnRequestDTO(existingReturnRequest),
        ...eligibilityOptions,
      }),
    });
  } catch (err) {
    console.error("❌ Error fetching shopper order detail:", err);
    res.status(500).json({ message: "Failed to fetch order details" });
  }
};

/**
 * POST /api/shopper/orders/:id/buy-again — rehydrate cart from historical order (live validation).
 */
exports.buyAgainFromOrder = async (req, res) => {
  try {
    const shopperId = req.user.id;
    const { id } = req.params;

    const result = await processBuyAgain({ orderId: id, shopperId });

    if (result.notFound) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (result.shopperNotFound) {
      return res.status(404).json({ message: "Shopper not found" });
    }

    res.json({
      success: result.success,
      addedItems: result.addedItems,
      failedItems: result.failedItems,
      warnings: result.warnings,
    });
  } catch (err) {
    console.error("❌ Buy Again error:", err);
    res.status(500).json({ message: "Failed to process Buy Again request" });
  }
};

/**
 * PUT /api/orders/:id/cancel — authoritative shopper order cancellation.
 */
exports.cancelShopperOrder = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { id } = req.params;
    const { reasonCode, customReason } = req.body || {};

    const reasonValidation = validateCancellationReason({ reasonCode, customReason });
    if (!reasonValidation.valid) {
      return res.status(400).json({ message: reasonValidation.message });
    }

    const order = await Order.findOne({ _id: id, buyer: buyerId });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const eligibility = getCancellationEligibility(order);
    if (!eligibility.eligible) {
      return res.status(400).json({
        message: eligibility.message,
        cancelEligibility: eligibility,
      });
    }

    order.status = "cancelled";
    order.cancelledBy = buyerId;
    order.cancellationReasonCode = reasonValidation.reasonCode;
    order.cancellationReasonText = reasonValidation.reasonText;
    order.cancelledAt = new Date();
    order.updatedAt = new Date();
    try {
      await onOrderCancelled(order);
    } catch (integrityErr) {
      console.error("commerce integrity on cancellation failed:", integrityErr.message);
    }
    await order.save();

    res.json({
      message: "Order cancelled successfully",
      cancelEligibility: getCancellationEligibility(order),
    });
  } catch (err) {
    console.error("❌ Order cancellation error:", err);
    res.status(500).json({ message: "Failed to cancel order" });
  }
};
