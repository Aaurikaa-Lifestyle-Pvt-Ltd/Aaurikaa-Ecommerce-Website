/**
 * AAURIKAA Admin operates the existing after-sales engine using the internal
 * store Seller identity. This is not a parallel return workflow.
 *
 * Refund resolution is not offered here (SEC-006 / client policy HOLD).
 */

const { getOrCreateInternalSeller } = require("./aaurikaaFoundationService");
const {
  reviewSellerDecision,
  confirmSellerReceipt,
  selectSellerResolution,
  retrySellerReturnPickup,
} = require("./sellerReturnService");

const REFUND_HOLD_MESSAGE =
  "Refund processing is on hold until the AAURIKAA refund policy is approved.";

async function withInternalSeller(fn) {
  const seller = await getOrCreateInternalSeller();
  if (!seller || !seller._id) {
    return {
      notFound: true,
      message: "Internal store identity is not configured.",
    };
  }
  return fn(String(seller._id));
}

async function reviewAfterSalesCase(params) {
  const resolution = String(params.resolution || "")
    .trim()
    .toLowerCase();
  if (resolution === "refund") {
    return { notAllowed: true, message: REFUND_HOLD_MESSAGE };
  }
  return withInternalSeller((sellerId) =>
    reviewSellerDecision({ ...params, sellerId })
  );
}

async function confirmAfterSalesReceipt(params) {
  return withInternalSeller((sellerId) =>
    confirmSellerReceipt({ ...params, sellerId })
  );
}

async function resolveAfterSalesCase(params) {
  const resolution = String(params.resolution || "")
    .trim()
    .toLowerCase();
  if (resolution === "refund") {
    return { notAllowed: true, message: REFUND_HOLD_MESSAGE };
  }
  return withInternalSeller((sellerId) =>
    selectSellerResolution({ ...params, sellerId })
  );
}

async function retryAfterSalesPickup(params) {
  return withInternalSeller((sellerId) =>
    retrySellerReturnPickup({ ...params, sellerId })
  );
}

module.exports = {
  REFUND_HOLD_MESSAGE,
  reviewAfterSalesCase,
  confirmAfterSalesReceipt,
  resolveAfterSalesCase,
  retryAfterSalesPickup,
};
