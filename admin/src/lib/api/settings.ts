import { apiRequest, unwrapData } from "./client";

export type SiteSettingsPayload = {
  title?: string;
  tagline?: string;
  logo?: string;
  favicon?: string;
};

export type ContactInfoPayload = {
  email?: string;
  phone?: string;
  address?: string;
};

export type SeoPayload = {
  title?: string;
  description?: string;
  keywords?: string;
};

export async function fetchSiteSettings(): Promise<SiteSettingsPayload> {
  return apiRequest<SiteSettingsPayload>("/api/settings/site", { auth: true });
}

export async function updateSiteSettings(input: { title?: string; tagline?: string }): Promise<void> {
  await apiRequest("/api/settings/site", { method: "PUT", body: input });
}

export async function fetchContactInfo(): Promise<ContactInfoPayload> {
  return apiRequest<ContactInfoPayload>("/api/settings/contact-info");
}

export async function updateContactInfo(input: ContactInfoPayload): Promise<void> {
  await apiRequest("/api/settings/contact-info", { method: "PUT", body: input });
}

export async function fetchSeoSettings(): Promise<SeoPayload> {
  return apiRequest<SeoPayload>("/api/settings/seo", { auth: false });
}

export async function updateSeoSettings(input: SeoPayload): Promise<void> {
  await apiRequest("/api/settings/seo", { method: "PUT", body: input });
}

export type FooterLink = {
  label: string;
  url: string;
};

export type FooterColumn = {
  title: string;
  links: FooterLink[];
};

export type FooterPayload = {
  gstin?: string;
  address?: string;
  companyName?: string;
  phone?: string;
  email?: string;
  columns?: FooterColumn[];
  socialLinks?: unknown[];
  paymentIcons?: unknown[];
  copyright?: string;
  text?: string;
  workingHours1?: string;
  workingHours2?: string;
};

export type HeaderPayload = {
  title?: string;
  tagline?: string;
  menuLinks?: string[];
};

export async function fetchFooter(): Promise<FooterPayload> {
  return apiRequest<FooterPayload>("/api/settings/footer");
}

export async function updateFooter(input: FooterPayload): Promise<void> {
  await apiRequest("/api/settings/footer", { method: "PUT", body: input });
}

export async function fetchHeader(): Promise<HeaderPayload> {
  return apiRequest<HeaderPayload>("/api/settings/header");
}

export async function updateHeader(input: HeaderPayload): Promise<void> {
  await apiRequest("/api/settings/header", { method: "PUT", body: input });
}

export async function fetchEnquiryNotificationEmail(): Promise<string> {
  const response = await apiRequest<{ notificationEmail?: string }>(
    "/api/settings/enquiry-notification",
  );
  return response.notificationEmail ?? "";
}

export async function updateEnquiryNotificationEmail(notificationEmail: string): Promise<void> {
  await apiRequest("/api/settings/enquiry-notification", {
    method: "PUT",
    body: { notificationEmail },
  });
}

export type ShippingMethodRow = {
  _id?: string;
  name?: string;
  cost?: number;
};

export async function fetchShippingMethods(): Promise<ShippingMethodRow[]> {
  const response = await apiRequest<{ data?: ShippingMethodRow[] | { methods?: ShippingMethodRow[] } }>(
    "/api/admin/shipping",
  );
  const data = unwrapData(response);
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as { methods?: ShippingMethodRow[] }).methods)) {
    return (data as { methods: ShippingMethodRow[] }).methods;
  }
  return [];
}
