const verifyAdmin = require("../middleware/verifyAdmin");
const loadAdminContext = require("../middleware/loadAdminContext");
const requirePermissionModule = require("../middleware/requirePermission");
const requirePermission = requirePermissionModule.requirePermission || requirePermissionModule;
const { requireAnyPermission } = requirePermissionModule;

/** verifyAdmin + loadAdminContext — profile, change-password, /me */
const adminBaseAuth = [verifyAdmin, loadAdminContext];

/** Full admin auth chain with optional permission gate */
const withAdminAuth = (domain, action) => [
  verifyAdmin,
  loadAdminContext,
  requirePermission(domain, action),
];

/**
 * Full admin auth chain that passes when ANY listed permission matches.
 * @param {Array<{ domain: string, action: string }>} permissions
 */
const withAnyAdminAuth = (permissions) => [
  verifyAdmin,
  loadAdminContext,
  requireAnyPermission(permissions),
];

module.exports = {
  verifyAdmin,
  loadAdminContext,
  requirePermission,
  requireAnyPermission,
  adminBaseAuth,
  withAdminAuth,
  withAnyAdminAuth,
};
