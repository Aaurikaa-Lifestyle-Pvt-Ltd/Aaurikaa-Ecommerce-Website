export type PaymentMethodId = "cod" | "phonepe";

export interface PaymentOption {
  id: PaymentMethodId;
  label: string;
  description: string;
}

/**
 * Shopper payment choices.
 * COD is hidden from customer-facing checkout UI while backend COD capability is preserved.
 */
export const paymentOptions: PaymentOption[] = [
  {
    id: "phonepe",
    label: "PhonePe",
    description: "Pay securely online with PhonePe (UPI, Cards, Net Banking).",
  },
];

export const ORDER_STORAGE_KEY = "aaurikaa.order.confirmation.v1";
