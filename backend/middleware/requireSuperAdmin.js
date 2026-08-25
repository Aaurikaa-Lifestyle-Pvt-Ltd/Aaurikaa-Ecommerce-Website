const {
  sendErrorResponse,
  ERROR_MESSAGES,
  ERROR_CODES,
  HTTP_STATUS,
} = require("../utils/errorHandler");

/**
 * Restrict route to Super Admin only. Must run after loadAdminContext.
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.adminUser?.isSuperAdmin) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      ERROR_MESSAGES.ACCESS_DENIED,
      ERROR_CODES.AUTH_ACCESS_DENIED
    );
  }

  next();
};

module.exports = requireSuperAdmin;
