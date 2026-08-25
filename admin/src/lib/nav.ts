export const adminNav = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/gallery", label: "Gallery" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/catalogue-import", label: "Import / Export" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/returns", label: "Returns" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/enquiries", label: "Enquiries" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/spin-campaigns", label: "Spin to Win" },
  { href: "/admin/banners", label: "Banners" },
  { href: "/admin/collections", label: "Collections" },
  { href: "/admin/occasions", label: "Occasions" },
  { href: "/admin/looks", label: "Shop the Look" },
  { href: "/admin/ugc", label: "Styled by You" },
  { href: "/admin/cms", label: "CMS" },
  { href: "/admin/seo", label: "SEO" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/shipping", label: "Shipping" },
  { href: "/admin/stock-alerts", label: "Stock alerts" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/settings", label: "Account" },
] as const;

export function isNavActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
