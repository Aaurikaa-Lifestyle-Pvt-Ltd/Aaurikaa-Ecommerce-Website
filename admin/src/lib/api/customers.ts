import type { AdminCustomer } from "@/types/admin";
import { apiRequest } from "./client";
import { mapAdminCustomer, mapAdminCustomers } from "../mappers/customer";

export async function fetchAdminCustomers(): Promise<AdminCustomer[]> {
  const response = await apiRequest<unknown>("/api/admin/shoppers");
  return mapAdminCustomers(response);
}

export async function fetchAdminCustomer(id: string): Promise<AdminCustomer | null> {
  const customers = await fetchAdminCustomers();
  return customers.find((customer) => customer.id === id) ?? null;
}

export async function updateAdminCustomer(
  id: string,
  input: { firstName?: string; lastName?: string; phone?: string },
): Promise<AdminCustomer | null> {
  const body = new FormData();
  if (input.firstName) body.append("firstName", input.firstName);
  if (input.lastName) body.append("lastName", input.lastName);
  if (input.phone) body.append("phone", input.phone);
  const response = await apiRequest<{ shopper?: Record<string, unknown> }>(
    `/api/admin/shoppers/${id}`,
    { method: "PUT", body },
  );
  return mapAdminCustomer(response.shopper ?? null);
}
