export type AdminNavPermission = { domain: string; action: string };

export type AdminNavItem = {
  href: string;
  label: string;
  exact?: boolean;
  permission?: AdminNavPermission;
  requiresSuperAdmin?: boolean;
  alwaysAccessible?: boolean;
};

export type AdminRouteGuardRule = {
  prefix: string;
  /** When true, only exact path match (needed for `/admin` dashboard). */
  exact?: boolean;
  permission?: AdminNavPermission;
  requiresSuperAdmin?: boolean;
  alwaysAccessible?: boolean;
  public?: boolean;
};

export const PUBLIC_ADMIN_PATHS = ["/admin/login"] as const;

export const ALWAYS_ACCESSIBLE_ADMIN_PATHS = [
  "/admin",
  "/admin/settings",
  "/admin/unauthorized",
] as const;

export const adminNav: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", exact: true, alwaysAccessible: true },
  { href: "/admin/products", label: "Products", permission: { domain: "catalog", action: "view" } },
  { href: "/admin/gallery", label: "Gallery", permission: { domain: "media", action: "view" } },
  {
    href: "/admin/categories",
    label: "Categories",
    permission: { domain: "taxonomy", action: "view" },
  },
  {
    href: "/admin/catalogue-import",
    label: "Import / Export",
    permission: { domain: "catalog", action: "view" },
  },
  { href: "/admin/orders", label: "Orders", permission: { domain: "orders", action: "view" } },
  {
    href: "/admin/returns",
    label: "Returns",
    permission: { domain: "order_returns", action: "view" },
  },
  { href: "/admin/reviews", label: "Reviews", permission: { domain: "reviews", action: "view" } },
  {
    href: "/admin/customers",
    label: "Customers",
    permission: { domain: "shoppers", action: "view" },
  },
  {
    href: "/admin/enquiries",
    label: "Enquiries",
    permission: { domain: "support", action: "view" },
  },
  {
    href: "/admin/coupons",
    label: "Coupons",
    permission: { domain: "promotions", action: "view" },
  },
  {
    href: "/admin/spin-campaigns",
    label: "Spin to Win",
    permission: { domain: "promotions", action: "view" },
  },
  {
    href: "/admin/banners",
    label: "Banners",
    permission: { domain: "homepage", action: "view" },
  },
  {
    href: "/admin/collections",
    label: "Collections",
    permission: { domain: "homepage", action: "view" },
  },
  {
    href: "/admin/occasions",
    label: "Occasions",
    permission: { domain: "homepage", action: "view" },
  },
  {
    href: "/admin/looks",
    label: "Shop the Look",
    permission: { domain: "homepage", action: "view" },
  },
  {
    href: "/admin/ugc",
    label: "Styled by You",
    permission: { domain: "homepage", action: "view" },
  },
  { href: "/admin/cms", label: "CMS", permission: { domain: "cms", action: "view" } },
  { href: "/admin/seo", label: "SEO", permission: { domain: "site_settings", action: "view" } },
  {
    href: "/admin/inventory",
    label: "Inventory",
    permission: { domain: "catalog", action: "view" },
  },
  {
    href: "/admin/shipping",
    label: "Shipping",
    permission: { domain: "catalog_config", action: "view" },
  },
  {
    href: "/admin/stock-alerts",
    label: "Stock alerts",
    permission: { domain: "catalog", action: "view" },
  },
  { href: "/admin/staff", label: "Staff", requiresSuperAdmin: true },
  { href: "/admin/settings", label: "Account", alwaysAccessible: true },
];

/**
 * Route → permission map for page guards.
 * Ordered most-specific first; prefix match for nested segments.
 */
export const ADMIN_ROUTE_PERMISSIONS: AdminRouteGuardRule[] = [
  { prefix: "/admin/staff", requiresSuperAdmin: true },
  { prefix: "/admin/login", public: true },
  { prefix: "/admin/unauthorized", alwaysAccessible: true },
  { prefix: "/admin/settings", alwaysAccessible: true },
  { prefix: "/admin/products", permission: { domain: "catalog", action: "view" } },
  { prefix: "/admin/gallery", permission: { domain: "media", action: "view" } },
  { prefix: "/admin/categories", permission: { domain: "taxonomy", action: "view" } },
  { prefix: "/admin/brands", permission: { domain: "taxonomy", action: "view" } },
  { prefix: "/admin/catalogue-import", permission: { domain: "catalog", action: "view" } },
  { prefix: "/admin/orders", permission: { domain: "orders", action: "view" } },
  { prefix: "/admin/returns", permission: { domain: "order_returns", action: "view" } },
  { prefix: "/admin/reviews", permission: { domain: "reviews", action: "view" } },
  { prefix: "/admin/customers", permission: { domain: "shoppers", action: "view" } },
  { prefix: "/admin/enquiries", permission: { domain: "support", action: "view" } },
  { prefix: "/admin/coupons", permission: { domain: "promotions", action: "view" } },
  { prefix: "/admin/spin-campaigns", permission: { domain: "promotions", action: "view" } },
  { prefix: "/admin/banners", permission: { domain: "homepage", action: "view" } },
  { prefix: "/admin/collections", permission: { domain: "homepage", action: "view" } },
  { prefix: "/admin/occasions", permission: { domain: "homepage", action: "view" } },
  { prefix: "/admin/looks", permission: { domain: "homepage", action: "view" } },
  { prefix: "/admin/ugc", permission: { domain: "homepage", action: "view" } },
  { prefix: "/admin/cms", permission: { domain: "cms", action: "view" } },
  { prefix: "/admin/seo", permission: { domain: "site_settings", action: "view" } },
  { prefix: "/admin/inventory", permission: { domain: "catalog", action: "view" } },
  { prefix: "/admin/shipping", permission: { domain: "catalog_config", action: "view" } },
  { prefix: "/admin/stock-alerts", permission: { domain: "catalog", action: "view" } },
  { prefix: "/admin", exact: true, alwaysAccessible: true },
];

export function isNavActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isPublicAdminPath(pathname: string): boolean {
  const path = pathname.split("?")[0];
  return PUBLIC_ADMIN_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export function isAlwaysAccessibleAdminPath(pathname: string): boolean {
  const path = pathname.split("?")[0];
  if (path === "/admin") return true;
  return ALWAYS_ACCESSIBLE_ADMIN_PATHS.filter((p) => p !== "/admin").some(
    (allowed) => path === allowed || path.startsWith(`${allowed}/`),
  );
}

export function getRouteGuardRule(pathname: string): AdminRouteGuardRule | undefined {
  const path = pathname.split("?")[0];
  return ADMIN_ROUTE_PERMISSIONS.find((rule) => {
    if (rule.exact) return path === rule.prefix;
    return path === rule.prefix || path.startsWith(`${rule.prefix}/`);
  });
}

export function filterAdminNav(
  items: AdminNavItem[],
  opts: {
    hasPermission: (domain: string, action: string) => boolean;
    isSuperAdmin: boolean;
  },
): AdminNavItem[] {
  return items.filter((item) => {
    if (item.alwaysAccessible) return true;
    if (item.requiresSuperAdmin) return opts.isSuperAdmin;
    if (item.permission) {
      return opts.hasPermission(item.permission.domain, item.permission.action);
    }
    return true;
  });
}

export function canAccessAdminPath(
  pathname: string,
  opts: {
    hasPermission: (domain: string, action: string) => boolean;
    isSuperAdmin: boolean;
  },
): boolean {
  const path = pathname.split("?")[0];
  if (isPublicAdminPath(path)) return true;
  if (isAlwaysAccessibleAdminPath(path)) return true;

  const rule = getRouteGuardRule(path);
  if (!rule) return true;
  if (rule.public || rule.alwaysAccessible) return true;
  if (rule.requiresSuperAdmin) return opts.isSuperAdmin;
  if (rule.permission) {
    return opts.hasPermission(rule.permission.domain, rule.permission.action);
  }
  return true;
}
