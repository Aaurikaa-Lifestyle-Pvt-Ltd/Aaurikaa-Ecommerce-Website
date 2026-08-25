/**
 * Admin pages and API-only endpoints without full nav/UI coverage.
 * Used by Phase 3 route protection and Phase 4 adminNavigation filtering.
 */

const RBAC_DECISIONS = require("./adminRbacDecisions");

/** Frontend routes excluded from admin navigation (see orphanPages decisions). */
const HIDDEN_ADMIN_NAV_PATHS = [
  "/admin/transactions",
];

/** Pages always accessible to any authenticated admin (no permission gate). */
const ALWAYS_ACCESSIBLE_ADMIN_PATHS = [
  "/admin/profile",
  "/admin/change-password",
  "/admin/login",
];

/**
 * Admin API mounts with no dedicated sidebar page — protect under existing domains.
 * Phase 3 requirePermission reads these mappings.
 */
const API_ONLY_ADMIN_PERMISSIONS = [
  {
    mount: "/api/admin/stock-notifications",
    methods: { GET: { domain: "catalog", action: "view" } },
    note: "Stock notification requests; no standalone admin page",
  },
  {
    mount: "/api/admin/inventory",
    methods: { GET: { domain: "catalog", action: "view" } },
    note: "Thin Admin inventory list over Product.stock/variantStock",
  },
  {
    mount: "/api/admin/pickup-locations",
    methods: {
      GET: { domain: "catalog_config", action: "view" },
      POST: { domain: "catalog_config", action: "manage" },
      PUT: { domain: "catalog_config", action: "manage" },
      PATCH: { domain: "catalog_config", action: "manage" },
      DELETE: { domain: "catalog_config", action: "manage" },
    },
    note: "Used by admin shipping page; no separate nav entry",
  },
  {
    mount: "/api/commissions",
    methods: {
      GET: { domain: "finance", action: "view" },
      POST: { domain: "finance", action: "manage" },
      PATCH: { domain: "finance", action: "approve" },
    },
    note: "Commission API; admin UI accessed via seller-payments and dashboard stats",
  },
];

const isHiddenFromAdminNav = (path) => HIDDEN_ADMIN_NAV_PATHS.includes(path);

const isAlwaysAccessibleAdminPath = (path) =>
  ALWAYS_ACCESSIBLE_ADMIN_PATHS.some(
    (allowed) => path === allowed || path.startsWith(`${allowed}/`)
  );

module.exports = {
  RBAC_DECISIONS,
  HIDDEN_ADMIN_NAV_PATHS,
  ALWAYS_ACCESSIBLE_ADMIN_PATHS,
  API_ONLY_ADMIN_PERMISSIONS,
  isHiddenFromAdminNav,
  isAlwaysAccessibleAdminPath,
};
