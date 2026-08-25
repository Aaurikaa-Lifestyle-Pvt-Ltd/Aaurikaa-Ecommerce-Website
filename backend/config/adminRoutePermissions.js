/**
 * Route-to-permission mappings for requirePermission middleware (Phase 3).
 * Orphan API-only endpoints are pre-mapped here from resolved open decisions.
 *
 * Enforcement is controlled by:
 * - PERMISSION_ENFORCEMENT=true|false (master switch)
 * - PERMISSION_ENFORCED_DOMAINS=*|domain1,domain2,... (gradual rollout)
 * See backend/config/permissionEnforcement.js
 */

const { DOMAIN_ROLLOUT_ORDER } = require("./permissionEnforcement");

const { API_ONLY_ADMIN_PERMISSIONS } = require("./adminOrphanPages");

/**
 * Resolve required permission for an API-only admin mount.
 * Returns { domain, action } or null if no explicit mapping.
 */
const resolveApiOnlyPermission = (mountPath, method) => {
  const normalizedMethod = (method || "GET").toUpperCase();
  const entry = API_ONLY_ADMIN_PERMISSIONS.find((item) => item.mount === mountPath);
  if (!entry) return null;

  const mapped = entry.methods[normalizedMethod];
  if (mapped) return mapped;

  const fallback = entry.methods.GET || entry.methods["*"];
  return fallback || null;
};

module.exports = {
  API_ONLY_ADMIN_PERMISSIONS,
  resolveApiOnlyPermission,
  DOMAIN_ROLLOUT_ORDER,
};
