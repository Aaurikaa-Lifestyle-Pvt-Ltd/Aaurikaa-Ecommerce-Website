/**
 * Checkout contract for Stage 6.
 *
 * COD and PhonePe order create are wired to POST /api/orders.
 * PhonePe initiate/verify require PHONEPE_* credentials on the backend.
 * SEC-006 refunds remain HOLD.
 */

export const CHECKOUT_INTEGRATION_STATUS = "cod_phonepe" as const;

export const CHECKOUT_BACKEND_PATHS = {
  createOrder: "POST /api/orders",
  pricingQuote: "POST /api/pricing/calculate",
  shopperOrders: "GET /api/shopper/orders",
  shopperOrderDetail: "GET /api/shopper/orders/:id",
  shopperInvoice: "GET /api/orders/:id/invoice",
  adminInvoice: "GET /api/admin/orders/:id/invoice",
  initiatePayment: "POST /api/payment/initiate",
  verifyPayment: "POST /api/payment/verify",
} as const;

export const PHONEPE_STOREFRONT_STATUS = "wired_credentials_required" as const;
