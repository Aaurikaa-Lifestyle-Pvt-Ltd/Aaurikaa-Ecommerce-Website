const {
  formatPermissionKey,
  isValidPermission,
  isAssignablePermission,
  getValidPermissionKeys,
} = require("../config/adminPermissionCatalog");

/**
 * Check whether an admin user has a specific permission.
 * Super Admin bypasses all checks.
 */
const hasPermission = (adminUser, domain, action) => {
  if (!adminUser) return false;
  if (adminUser.isSuperAdmin) return true;

  const key = formatPermissionKey(domain, action);
  return (adminUser.permissions || []).includes(key);
};

/**
 * Validate an array of permission keys against the catalog.
 */
const validatePermissionKeys = (keys) => {
  if (!Array.isArray(keys)) {
    return { valid: false, invalid: [], message: "permissions must be an array" };
  }

  const invalid = keys.filter(
    (key) => !isValidPermission(key) || !isAssignablePermission(key)
  );
  return {
    valid: invalid.length === 0,
    invalid,
  };
};

/**
 * Shape admin auth fields for API responses (login, /me).
 */
const formatAdminAuthPayload = (admin) => ({
  id: admin._id,
  name: admin.name,
  username: admin.username,
  email: admin.email,
  profileImage: admin.profileImage,
  isSuperAdmin: admin.isSuperAdmin ?? false,
  permissions: admin.isSuperAdmin ? [] : admin.permissions || [],
  displayLabel: admin.displayLabel || null,
});

module.exports = {
  hasPermission,
  validatePermissionKeys,
  formatPermissionKey,
  isValidPermission,
  isAssignablePermission,
  getValidPermissionKeys,
  formatAdminAuthPayload,
};
