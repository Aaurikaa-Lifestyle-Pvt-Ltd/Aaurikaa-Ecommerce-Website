import { apiRequest } from "./client";

export type PublicSiteSettings = {
  title?: string;
  tagline?: string;
  logo?: string;
  favicon?: string;
};

export type PublicFooterLink = {
  label: string;
  url: string;
};

export type PublicFooterColumn = {
  title: string;
  links: PublicFooterLink[];
};

export type PublicFooterSocialLink = {
  platform?: string;
  url?: string;
  isEnabled?: boolean;
  order?: number;
};

export type PublicFooterSettings = {
  columns?: PublicFooterColumn[];
  socialLinks?: PublicFooterSocialLink[];
  copyright?: string;
  companyName?: string;
  gstin?: string;
  address?: string;
  phone?: string;
  email?: string;
  workingHours1?: string;
  workingHours2?: string;
  text?: string;
};

export type PublicHeaderSettings = {
  title?: string;
  tagline?: string;
  menuLinks?: string[];
};

export async function fetchPublicSiteSettings(): Promise<PublicSiteSettings> {
  return apiRequest<PublicSiteSettings>("/api/settings/site", { auth: false });
}

export async function fetchPublicFooterSettings(): Promise<PublicFooterSettings> {
  return apiRequest<PublicFooterSettings>("/api/settings/footer", { auth: false });
}

export async function fetchPublicHeaderSettings(): Promise<PublicHeaderSettings> {
  return apiRequest<PublicHeaderSettings>("/api/settings/header", { auth: false });
}

export function footerHasUsableColumns(footer: PublicFooterSettings | null | undefined): boolean {
  if (!footer?.columns?.length) return false;
  return footer.columns.some(
    (col) =>
      Boolean(col?.title?.trim()) &&
      Array.isArray(col.links) &&
      col.links.some((link) => Boolean(link?.label?.trim() && link?.url?.trim())),
  );
}

export function footerHasUsableSocial(footer: PublicFooterSettings | null | undefined): boolean {
  if (!footer?.socialLinks?.length) return false;
  return footer.socialLinks.some(
    (link) => link?.isEnabled !== false && Boolean(link?.url?.trim()),
  );
}

export { parseHeaderMenuLinks, type HeaderNavLink } from "./site-nav";
