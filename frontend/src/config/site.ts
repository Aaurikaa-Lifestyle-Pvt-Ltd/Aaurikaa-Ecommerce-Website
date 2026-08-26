/**
 * Site-level configuration.
 *
 * This is the single place a future client would edit to re-brand the base
 * (brief §28: configuration philosophy). Presentation components should read
 * from here rather than embedding brand-specific content.
 *
 * Values below are demo content for the premium imitation-jewellery storefront.
 */

export interface NavLink {
  label: string;
  href: string;
}

export interface SocialLink {
  label: string;
  href: string;
}

export interface FooterGroup {
  title: string;
  links: NavLink[];
}

export interface SiteConfig {
  name: string;
  tagline: string;
  description: string;
  /** Path to the logo asset, or null to fall back to a wordmark. */
  logo: string | null;
  /** Lightweight promotional/service line shown in the announcement bar. */
  announcement: string;
  primaryNav: NavLink[];
  footerGroups: FooterGroup[];
  social: SocialLink[];
  contact: {
    email?: string;
    phone?: string;
    whatsapp?: string;
  };
}

export const siteConfig: SiteConfig = {
  name: "AAURIKAA",
  tagline: "Premium Imitation Jewellery",
  description:
    "Discover premium imitation jewellery — modern, editorial pieces for everyday moments and special occasions.",
  logo: "/images/logo/Aaurikaa logo .png",
  announcement: "Complimentary shipping on all orders over ₹1,499",
  primaryNav: [
    { label: "New Arrivals", href: "/collections/new-arrivals" },
    { label: "Jewellery", href: "/categories" },
    { label: "Collections", href: "/collections" },
    { label: "Occasions", href: "/occasions" },
    { label: "Best Sellers", href: "/collections/best-sellers" },
  ],
  footerGroups: [
    {
      title: "Shop",
      links: [
        { label: "New Arrivals", href: "/collections/new-arrivals" },
        { label: "Jewellery", href: "/categories" },
        { label: "Collections", href: "/collections" },
        { label: "Best Sellers", href: "/collections/best-sellers" },
        { label: "Gifts", href: "/collections/gifts" },
      ],
    },
    {
      title: "Customer Care",
      links: [
        { label: "Contact", href: "/contact" },
        { label: "Shipping", href: "/shipping" },
        { label: "Returns", href: "/returns" },
        { label: "FAQs", href: "/faqs" },
        { label: "Help Center", href: "/help-center" },
      ],
    },
    {
      title: "About",
      links: [{ label: "Our Story", href: "/about" }],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
        { label: "Refund & Return Policy", href: "/refund-policy" },
      ],
    },
  ],
  social: [
    { label: "Instagram", href: "https://instagram.com" },
    { label: "Facebook", href: "https://facebook.com" },
    { label: "WhatsApp", href: "https://wa.me/" },
  ],
  contact: {
    email: "hello@imagineairy.example",
    phone: "+00 00000 00000",
    whatsapp: "https://wa.me/",
  },
};
