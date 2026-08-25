import type { AdminCoupon, EntityStatus } from "@/types/admin";
import { idString } from "./media";

export function mapAdminCoupon(raw: Record<string, unknown> | null | undefined): AdminCoupon | null {
  if (!raw) return null;
  const id = idString(raw._id);
  if (!id) return null;
  const type = String(raw.discountType ?? "");
  const value = Number(raw.discountValue) || 0;
  const discount =
    type === "percentage" ? `${value}%` : type === "fixed" ? `₹${value}` : String(value);
  return {
    id,
    code: String(raw.code ?? ""),
    discount,
    status: raw.isActive === false ? "Inactive" : ("Active" as EntityStatus),
    expiry: raw.validTo ? String(raw.validTo).slice(0, 10) : "",
    description: type === "none" && raw.freeShipping ? "Free shipping" : type,
  };
}

export function mapAdminCoupons(raw: unknown): AdminCoupon[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => mapAdminCoupon(item as Record<string, unknown>))
    .filter((item): item is AdminCoupon => Boolean(item));
}

export function parseCouponDiscount(input: string): { discountType: string; discountValue: number } {
  const trimmed = input.trim();
  if (trimmed.endsWith("%")) {
    return { discountType: "percentage", discountValue: Number(trimmed.replace("%", "")) || 0 };
  }
  const numeric = Number(trimmed.replace(/[₹,]/g, ""));
  return { discountType: "fixed", discountValue: Number.isFinite(numeric) ? numeric : 0 };
}
