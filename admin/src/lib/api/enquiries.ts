import { apiRequest, unwrapData } from "./client";

export type AdminEnquiry = {
  _id?: string;
  id?: string;
  enquiryNumber?: string;
  status?: string;
  category?: string;
  subject?: string;
  message?: string;
  createdAt?: string;
  submitter?: { name?: string; email?: string; phone?: string };
};

export async function fetchAdminEnquiries(): Promise<AdminEnquiry[]> {
  const response = await apiRequest<{ enquiries?: AdminEnquiry[] }>("/api/admin/enquiries");
  return Array.isArray(response.enquiries) ? response.enquiries : [];
}

export async function fetchAdminEnquiry(id: string): Promise<AdminEnquiry | null> {
  const response = await apiRequest<{ data?: AdminEnquiry }>(
    `/api/admin/enquiries/${encodeURIComponent(id)}`,
  );
  return unwrapData(response) ?? null;
}

export async function patchAdminEnquiry(
  id: string,
  body: { status?: string; adminNotes?: string },
): Promise<void> {
  await apiRequest(`/api/admin/enquiries/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
}
