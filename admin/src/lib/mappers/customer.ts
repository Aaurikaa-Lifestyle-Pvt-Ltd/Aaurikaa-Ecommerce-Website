import type { AdminCustomer } from "@/types/admin";
import { idString } from "./media";
import { omitPassword } from "./helpers";

export function mapAdminCustomer(raw: Record<string, unknown> | null | undefined): AdminCustomer | null {
  if (!raw) return null;
  const id = idString(raw._id ?? raw.id);
  if (!id) return null;
  const firstName = String(raw.firstName ?? "");
  const lastName = String(raw.lastName ?? "");
  const name = `${firstName} ${lastName}`.trim() || String(raw.username ?? "Customer");

  return {
    id,
    name,
    email: String(raw.email ?? ""),
    phone: String(raw.phone ?? ""),
    ordersCount: 0,
    totalSpent: 0,
    joinedAt: String(raw.createdAt ?? new Date().toISOString()),
    city: "",
  };
}

export function mapAdminCustomers(raw: unknown): AdminCustomer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = omitPassword({ ...(item as Record<string, unknown>) });
      return mapAdminCustomer(record);
    })
    .filter((item): item is AdminCustomer => Boolean(item));
}

export function customerHasPasswordField(raw: unknown): boolean {
  return Boolean(raw && typeof raw === "object" && "password" in raw);
}
