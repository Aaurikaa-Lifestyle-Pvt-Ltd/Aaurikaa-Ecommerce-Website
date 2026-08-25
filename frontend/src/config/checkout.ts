export type PaymentMethodId = "cod" | "phonepe";

export interface PaymentOption {
  id: PaymentMethodId;
  label: string;
  description: string;
}

/**
 * Shopper payment choices only.
 * Shipping amounts are never listed here — zone rates come from
 * POST /api/pricing/calculate and again at order create.
 */
export const paymentOptions: PaymentOption[] = [
  {
    id: "cod",
    label: "Cash on Delivery",
    description: "Pay when your order arrives.",
  },
  {
    id: "phonepe",
    label: "PhonePe",
    description: "Pay securely online with PhonePe.",
  },
];

export const ORDER_STORAGE_KEY = "aaurikaa.order.confirmation.v1";
