import type { PaymentMethodId } from "@/config/checkout";
import { formatMoney } from "./format.ts";

export interface CheckoutCustomer {
  fullName: string;
  email: string;
  phone: string;
}

/**
 * Place-order / PhonePe CTA. Amount only when server quote.total is available -
 * never invent a client total.
 */
export function placeOrderCtaLabel(
  paymentMethod: PaymentMethodId,
  quoteTotal: number | null | undefined,
): string {
  const base = paymentMethod === "phonepe" ? "Pay with PhonePe" : "Place Order";
  if (typeof quoteTotal !== "number" || !Number.isFinite(quoteTotal)) {
    return base;
  }
  return `${base} - ${formatMoney({ amount: quoteTotal, currency: "INR" })}`;
}

export interface CheckoutAddress {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  /** Display / engine name (e.g. "Maharashtra"). */
  state: string;
  /** State master id from location API - never shown as a visible label. */
  stateId?: string;
  /** District master id from location API (address-book / UX only). */
  districtId?: string;
  countryName?: string;
  countryId?: string;
  pinCode: string;
  phone: string;
}

export interface CheckoutFormValues {
  customer: CheckoutCustomer;
  shipping: CheckoutAddress;
  paymentMethod: PaymentMethodId;
}

export type CheckoutFieldErrors = Partial<
  Record<
    | "customer.fullName"
    | "customer.email"
    | "customer.phone"
    | "shipping.fullName"
    | "shipping.addressLine1"
    | "shipping.city"
    | "shipping.state"
    | "shipping.district"
    | "shipping.country"
    | "shipping.pinCode"
    | "shipping.phone",
    string
  >
>;

export const emptyCheckoutForm: CheckoutFormValues = {
  customer: { fullName: "", email: "", phone: "" },
  shipping: {
    fullName: "",
    addressLine1: "",
    addressLine2: "",
    landmark: "",
    city: "",
    state: "",
    stateId: "",
    districtId: "",
    countryName: "India",
    countryId: "",
    pinCode: "",
    phone: "",
  },
  paymentMethod: "phonepe",
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidIndianPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 12 && digits.startsWith("91"));
}

function isValidPin(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

export type ValidateCheckoutOptions = {
  /**
   * When true (default), district master selection is required.
   * Callers skip this when districts are unavailable for the state,
   * or when a complete saved address is used without editing.
   */
  requireDistrict?: boolean;
};

export function validateCheckoutForm(
  values: CheckoutFormValues,
  options?: ValidateCheckoutOptions,
): CheckoutFieldErrors {
  const errors: CheckoutFieldErrors = {};
  const requireDistrict = options?.requireDistrict !== false;

  if (!values.customer.fullName.trim()) {
    errors["customer.fullName"] = "Enter your full name.";
  }
  if (!values.customer.email.trim()) {
    errors["customer.email"] = "Enter your email address.";
  } else if (!isValidEmail(values.customer.email.trim())) {
    errors["customer.email"] = "Enter a valid email address.";
  }
  if (!values.customer.phone.trim()) {
    errors["customer.phone"] = "Enter your phone number.";
  } else if (!isValidIndianPhone(values.customer.phone)) {
    errors["customer.phone"] = "Enter a valid 10-digit mobile number.";
  }

  if (!values.shipping.fullName.trim()) {
    errors["shipping.fullName"] = "Enter the recipient's full name.";
  }
  if (!values.shipping.addressLine1.trim()) {
    errors["shipping.addressLine1"] = "Enter address line 1.";
  }
  if (!values.shipping.city.trim()) {
    errors["shipping.city"] = "Enter your city or town.";
  }
  if (!values.shipping.countryId?.trim() && !values.shipping.countryName?.trim()) {
    errors["shipping.country"] = "Select your country.";
  }
  if (!values.shipping.state.trim() && !values.shipping.stateId?.trim()) {
    errors["shipping.state"] = "Select your state.";
  }
  if (requireDistrict && !values.shipping.districtId?.trim()) {
    errors["shipping.district"] = "Select your district.";
  }
  if (!values.shipping.pinCode.trim()) {
    errors["shipping.pinCode"] = "Enter your PIN code.";
  } else if (!isValidPin(values.shipping.pinCode)) {
    errors["shipping.pinCode"] = "Enter a valid 6-digit PIN code.";
  }
  if (!values.shipping.phone.trim()) {
    errors["shipping.phone"] = "Enter a delivery phone number.";
  } else if (!isValidIndianPhone(values.shipping.phone)) {
    errors["shipping.phone"] = "Enter a valid 10-digit mobile number.";
  }

  return errors;
}
