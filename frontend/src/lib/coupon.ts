const COUPON_STORAGE_KEY = "aaurikaa.checkout.coupon.v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function readCheckoutCoupon(): string {
  if (!canUseStorage()) return "";
  try {
    return String(sessionStorage.getItem(COUPON_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function writeCheckoutCoupon(code: string): void {
  if (!canUseStorage()) return;
  const next = code.trim().toUpperCase();
  try {
    if (next) sessionStorage.setItem(COUPON_STORAGE_KEY, next);
    else sessionStorage.removeItem(COUPON_STORAGE_KEY);
  } catch {
    // Quote still works from in-memory checkout state.
  }
}

export { COUPON_STORAGE_KEY };
