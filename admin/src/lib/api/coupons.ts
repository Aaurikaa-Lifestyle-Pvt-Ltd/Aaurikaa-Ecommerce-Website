import type { AdminCoupon } from "@/types/admin";
import { apiRequest, unwrapData } from "./client";
import { mapAdminCoupon, mapAdminCoupons, parseCouponDiscount } from "../mappers/coupon";

export async function fetchAdminCoupons(): Promise<AdminCoupon[]> {
  const response = await apiRequest<{ data?: unknown }>("/api/admin/coupons");
  return mapAdminCoupons(unwrapData(response));
}

export async function saveAdminCoupon(input: {
  id?: string;
  code: string;
  discount: string;
  expiry: string;
  status: string;
}): Promise<AdminCoupon | null> {
  const parsed = parseCouponDiscount(input.discount);
  const payload = {
    code: input.code.trim().toUpperCase(),
    discountType: parsed.discountType,
    discountValue: parsed.discountValue,
    expiry: input.expiry,
    isActive: input.status !== "Inactive",
  };
  if (input.id) {
    const response = await apiRequest<{ data?: Record<string, unknown> }>(
      `/api/admin/coupons/${input.id}`,
      { method: "PUT", body: payload },
    );
    return mapAdminCoupon(unwrapData(response) as Record<string, unknown>);
  }
  const response = await apiRequest<{ data?: Record<string, unknown> }>("/api/admin/coupons", {
    method: "POST",
    body: payload,
  });
  return mapAdminCoupon(unwrapData(response) as Record<string, unknown>);
}
