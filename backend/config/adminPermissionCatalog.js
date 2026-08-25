/**
 * Static permission catalog — defines available permission keys for checkbox UI.
 * User assignments live on Admin.permissions[]; this file defines what can be assigned.
 */

const RBAC_DECISIONS = require("./adminRbacDecisions");

const DEFAULT_ACTIONS = [
  { id: "view", label: "View" },
  { id: "manage", label: "Manage" },
];

const ADMIN_PERMISSION_DOMAINS = [
  {
    id: "catalog",
    label: "Catalog (Products)",
    actions: [
      ...DEFAULT_ACTIONS,
      { id: "import", label: "Import" },
      { id: "export", label: "Export" },
    ],
  },
  { id: "taxonomy", label: "Taxonomy (Categories, Brands, Variants)", actions: DEFAULT_ACTIONS },
  { id: "catalog_config", label: "Catalog Config (Tax, Shipping, SKU)", actions: DEFAULT_ACTIONS },
  { id: "media", label: "Media Gallery", actions: DEFAULT_ACTIONS },
  { id: "shoppers", label: "Shoppers", actions: DEFAULT_ACTIONS },
  {
    id: "sellers",
    label: "Sellers",
    actions: [
      ...DEFAULT_ACTIONS,
      { id: "approve", label: "Approve" },
    ],
  },
  {
    id: "orders",
    label: "Orders",
    actions: [
      ...DEFAULT_ACTIONS,
      { id: "fulfill", label: "Fulfill (Shiprocket)" },
    ],
  },
  { id: "order_confirmations", label: "Order Confirmations", actions: DEFAULT_ACTIONS },
  { id: "order_returns", label: "Return & Refund Requests", actions: DEFAULT_ACTIONS },
  {
    id: "finance",
    label: "Finance (Payouts, Commissions)",
    actions: [
      ...DEFAULT_ACTIONS,
      { id: "approve", label: "Approve" },
      { id: "pay", label: "Pay" },
    ],
  },
  { id: "promotions", label: "Promotions (Offers, Coupons)", actions: DEFAULT_ACTIONS },
  { id: "content", label: "Content (Blog, Comments)", actions: DEFAULT_ACTIONS },
  { id: "reviews", label: "Product Reviews", actions: DEFAULT_ACTIONS },
  { id: "cms", label: "CMS Pages", actions: DEFAULT_ACTIONS },
  { id: "homepage", label: "Homepage Layout", actions: DEFAULT_ACTIONS },
  { id: "site_settings", label: "Site Settings", actions: DEFAULT_ACTIONS },
  { id: "support", label: "Support (Enquiries, Careers)", actions: DEFAULT_ACTIONS },
  { id: "localization", label: "Localization (Translations)", actions: DEFAULT_ACTIONS },
  { id: "newsletter", label: "Newsletter", actions: DEFAULT_ACTIONS },
  { id: "locations", label: "Locations & Addresses", actions: DEFAULT_ACTIONS },
  {
    id: "admin_users",
    label: "Admin Users (Staff Management)",
    actions: DEFAULT_ACTIONS,
    assignable: false,
    description: "Super Admin only — not assignable to staff accounts",
  },
];

const formatPermissionKey = (domain, action) => `${domain}:${action}`;

const VALID_PERMISSION_KEYS = new Set(
  ADMIN_PERMISSION_DOMAINS.flatMap((domain) =>
    domain.actions.map((action) => formatPermissionKey(domain.id, action.id))
  )
);

const isValidPermission = (key) => VALID_PERMISSION_KEYS.has(key);

const getValidPermissionKeys = () => Array.from(VALID_PERMISSION_KEYS);

const getPermissionCatalog = () => ADMIN_PERMISSION_DOMAINS;

/** Domains Super Admin can assign to staff via checkbox UI (excludes admin_users). */
const getAssignablePermissionCatalog = () =>
  ADMIN_PERMISSION_DOMAINS.filter(
    (domain) =>
      domain.assignable !== false &&
      !RBAC_DECISIONS.permissionCatalog.nonAssignableDomains.includes(domain.id)
  );

const getPermissionCatalogForUi = () => ({
  catalog: getAssignablePermissionCatalog(),
  groups: RBAC_DECISIONS.permissionCatalog.uiGroups,
  suggestedDisplayLabels: RBAC_DECISIONS.displayLabel.suggestedLabels,
  adminCreationFlow: RBAC_DECISIONS.adminCreationFlow,
});

const isAssignablePermission = (key) => {
  const [domainId] = key.split(":");
  return !RBAC_DECISIONS.permissionCatalog.nonAssignableDomains.includes(domainId);
};

module.exports = {
  ADMIN_PERMISSION_DOMAINS,
  formatPermissionKey,
  isValidPermission,
  getValidPermissionKeys,
  getPermissionCatalog,
  getAssignablePermissionCatalog,
  getPermissionCatalogForUi,
  isAssignablePermission,
};
