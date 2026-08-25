const { hasPermission } = require("../utils/adminPermissions");
const { isDomainEnforced } = require("../config/permissionEnforcement");
const {
  sendErrorResponse,
  ERROR_MESSAGES,
  ERROR_CODES,
  HTTP_STATUS,
} = require("../utils/errorHandler");

/**
 * Require a specific domain:action permission after loadAdminContext.
 * No-op when PERMISSION_ENFORCEMENT is off or the domain is not in the enforced set.
 */
const requirePermission = (domain, action) => (req, res, next) => {
  if (!isDomainEnforced(domain)) {
    return next();
  }

  if (!req.adminUser) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      ERROR_MESSAGES.ACCESS_DENIED,
      ERROR_CODES.AUTH_ACCESS_DENIED
    );
  }

  if (!hasPermission(req.adminUser, domain, action)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      ERROR_MESSAGES.ACCESS_DENIED,
      ERROR_CODES.AUTH_ACCESS_DENIED
    );
  }

  return next();
};

/**
 * Allow if the admin has ANY of the listed domain:action permissions.
 * Domains that are not currently enforced are ignored for the gate.
 * If none of the listed domains are enforced, the check is a no-op.
 */
const requireAnyPermission = (permissions) => (req, res, next) => {
  const list = Array.isArray(permissions) ? permissions : [];
  const enforced = list.filter(
    (p) => p && p.domain && p.action && isDomainEnforced(p.domain)
  );

  if (enforced.length === 0) {
    return next();
  }

  if (!req.adminUser) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      ERROR_MESSAGES.ACCESS_DENIED,
      ERROR_CODES.AUTH_ACCESS_DENIED
    );
  }

  const allowed = enforced.some((p) =>
    hasPermission(req.adminUser, p.domain, p.action)
  );

  if (!allowed) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      ERROR_MESSAGES.ACCESS_DENIED,
      ERROR_CODES.AUTH_ACCESS_DENIED
    );
  }

  return next();
};

module.exports = requirePermission;
module.exports.requirePermission = requirePermission;
module.exports.requireAnyPermission = requireAnyPermission;
