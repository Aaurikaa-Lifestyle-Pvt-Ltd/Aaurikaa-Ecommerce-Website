/**
 * Permission enforcement rollout — global flag + per-domain enablement.
 *
 * PERMISSION_ENFORCEMENT=true          — master switch for requirePermission blocking
 * PERMISSION_ENFORCED_DOMAINS=*        — all domains (default when flag is on)
 * PERMISSION_ENFORCED_DOMAINS=finance,sellers — gradual rollout subset
 */

const DOMAIN_ROLLOUT_ORDER = [
  "admin_users",
  "finance",
  "sellers",
  "orders",
  "site_settings",
  "catalog",
  "taxonomy",
  "catalog_config",
  "media",
  "shoppers",
  "order_confirmations",
  "order_returns",
  "promotions",
  "content",
  "reviews",
  "cms",
  "homepage",
  "support",
  "localization",
  "newsletter",
  "locations",
];

const isPermissionEnforcementActive = () =>
  process.env.PERMISSION_ENFORCEMENT === "true";

/**
 * Production must never boot with RBAC disabled.
 * Call once during server startup (after dotenv).
 */
function assertProductionPermissionEnforcement() {
  if (process.env.NODE_ENV !== "production") {
    return { ok: true };
  }
  if (process.env.PERMISSION_ENFORCEMENT === "true") {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      "FATAL: PERMISSION_ENFORCEMENT must be true when NODE_ENV=production. Admin After-Sales and other RBAC routes would otherwise be unprotected.",
  };
}

let enforcedDomainsCache = null;

const getEnforcedDomains = () => {
  if (enforcedDomainsCache) return enforcedDomainsCache;

  const raw = (process.env.PERMISSION_ENFORCED_DOMAINS || "*").trim();

  if (raw === "*" || raw === "") {
    enforcedDomainsCache = new Set(DOMAIN_ROLLOUT_ORDER);
    return enforcedDomainsCache;
  }

  enforcedDomainsCache = new Set(
    raw
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean)
  );
  return enforcedDomainsCache;
};

const isDomainEnforced = (domain) => {
  // Hard safety: After-Sales admin governance always requires RBAC in production,
  // even if the master switch or domain rollout list is misconfigured.
  if (
    process.env.NODE_ENV === "production" &&
    domain === "order_returns"
  ) {
    return true;
  }

  if (!isPermissionEnforcementActive()) return false;
  return getEnforcedDomains().has(domain);
};

/** Reset cached domain set (for tests). */
const resetEnforcementCache = () => {
  enforcedDomainsCache = null;
};

module.exports = {
  DOMAIN_ROLLOUT_ORDER,
  isPermissionEnforcementActive,
  getEnforcedDomains,
  isDomainEnforced,
  resetEnforcementCache,
  assertProductionPermissionEnforcement,
};
