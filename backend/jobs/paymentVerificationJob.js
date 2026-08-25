const Order = require("../models/Order");
const phonePeService = require("../services/phonePeService");
const orderFulfillmentService = require("../services/orderFulfillmentService");
const { applyPhonePeStateToOrder } = require("../controllers/paymentController");

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const BATCH_LIMIT = 50;

/**
 * Background reconciliation: pick stale PhonePe orders and align state with PhonePe order-status API.
 * Skips orders newer than 15 minutes to reduce overlap with the success-page polling flow.
 * Amount bind (SEC-040) is enforced inside applyPhonePeStateToOrder.
 */
async function verifyPendingPayments() {
  if (!phonePeService.isV2Enabled()) {
    return;
  }

  try {
    const cutoff = new Date(Date.now() - FIFTEEN_MIN_MS);

    const orders = await Order.find({
      paymentMethod: "phonepe",
      paymentStatus: "pending",
      paymentTransactionId: { $exists: true, $nin: [null, ""] },
      status: { $in: ["pending", "pending_verification"] },
      createdAt: { $lte: cutoff },
    })
      .sort({ createdAt: 1 })
      .limit(BATCH_LIMIT);

    for (const order of orders) {
      try {
        if (!order.paymentTransactionId) continue;

        const statusResponse = await phonePeService.checkPaymentStatus(
          order.paymentTransactionId,
          { details: true }
        );

        const state = String(
          statusResponse?.data?.state || statusResponse?.state || ""
        ).toUpperCase();

        if (state !== "COMPLETED" && state !== "FAILED") {
          continue;
        }

        await applyPhonePeStateToOrder(order, statusResponse);

        if (order.status === "paid") {
          await orderFulfillmentService.maybeSyncShiprocket(order._id).catch(() => {});
        }
      } catch (err) {
        console.error("Cron verification failed for order:", order._id, err.message);
      }
    }
  } catch (error) {
    console.error("Payment verification job error:", error.message);
  }
}

module.exports = verifyPendingPayments;
