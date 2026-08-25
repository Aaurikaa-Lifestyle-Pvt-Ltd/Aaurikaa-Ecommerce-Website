import type {
  AdminBanner,
  AdminCoupon,
  CmsContent,
  SeoSettings,
  StoreSettings,
} from "@/types/admin";

export const coupons: AdminCoupon[] = [
  {
    id: "cp-welcome",
    code: "WELCOME10",
    discount: "10% off",
    status: "Active",
    expiry: "2026-12-31",
    description: "First-order welcome discount",
  },
  {
    id: "cp-festive",
    code: "FESTIVE500",
    discount: "₹500 off",
    status: "Active",
    expiry: "2026-10-15",
    description: "Festive edit flat discount above ₹2,999",
  },
  {
    id: "cp-pearl",
    code: "PEARL15",
    discount: "15% off",
    status: "Inactive",
    expiry: "2026-06-30",
    description: "Pearl edit collection promo (ended)",
  },
];

export const banners: AdminBanner[] = [
  {
    id: "campaign-festive-edit",
    title: "The Festive Edit",
    status: "Active",
    image: "/images/campaigns/festive-edit.jpg",
    mobileImage: "/images/campaigns/festive-edit-mobile.jpg",
    ctaLabel: "Explore the Edit",
    ctaHref: "/collections/the-festive-edit",
  },
  {
    id: "campaign-everyday-gold",
    title: "From day to dinner",
    status: "Active",
    image: "/images/campaigns/everyday-gold.jpg",
    mobileImage: "/images/campaigns/everyday-gold-mobile.jpg",
    ctaLabel: "Shop Everyday",
    ctaHref: "/collections/everyday-gold",
  },
];

export const defaultCms: CmsContent = {
  heading: "Modern heirlooms, made to be worn",
  description:
    "Premium imitation jewellery designed for everyday moments and the occasions you'll remember.",
  ctaLabel: "Shop New Arrivals",
  ctaHref: "/collections/new-arrivals",
  image: "/images/hero-desktop-v2.png",
};

export const defaultSeo: SeoSettings = {
  metaTitle: "IMAGINEAIRY — Premium Imitation Jewellery",
  metaDescription:
    "Discover premium imitation jewellery — modern, editorial pieces for everyday moments and special occasions.",
  canonicalUrl: "https://imagineairy.example",
  socialImage: "/images/hero-desktop-v2.png",
};

export const defaultSettings: StoreSettings = {
  storeName: "IMAGINEAIRY",
  email: "hello@imagineairy.example",
  phone: "+00 00000 00000",
  whatsapp: "https://wa.me/",
  currency: "INR",
  shippingThreshold: 1499,
};

export const dashboardStats = {
  todaysSales: 6895,
  ordersToday: 3,
  customers: 6,
  products: 12,
};
