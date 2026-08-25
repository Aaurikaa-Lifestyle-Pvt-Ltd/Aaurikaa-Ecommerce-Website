const Admin = require("../models/Admin");
const {
  sendErrorResponse,
  ERROR_MESSAGES,
  ERROR_CODES,
  HTTP_STATUS,
  asyncHandler,
} = require("../utils/errorHandler");

/**
 * Loads admin authorization context from DB after verifyAdmin.
 * Enforces isActive + tokenVersion; attaches req.adminUser for downstream handlers.
 */
const loadAdminContext = asyncHandler(async (req, res, next) => {
  const adminId = req.user?.id || req.user?._id;

  if (!adminId) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_MESSAGES.TOKEN_INVALID,
      ERROR_CODES.AUTH_TOKEN_INVALID
    );
  }

  const admin = await Admin.findById(adminId).select(
    "isSuperAdmin isActive permissions tokenVersion displayLabel"
  );

  if (!admin) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      ERROR_MESSAGES.ADMIN_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  if (!admin.isActive) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      "Admin account is deactivated",
      ERROR_CODES.AUTH_ACCESS_DENIED
    );
  }

  const jwtTokenVersion = req.user.tokenVersion ?? 0;
  const dbTokenVersion = admin.tokenVersion ?? 0;

  if (jwtTokenVersion !== dbTokenVersion) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      "Session has been revoked. Please login again.",
      ERROR_CODES.AUTH_TOKEN_INVALID
    );
  }

  req.adminUser = {
    _id: admin._id,
    isSuperAdmin: admin.isSuperAdmin ?? false,
    permissions: admin.permissions || [],
    displayLabel: admin.displayLabel || null,
  };

  next();
});

module.exports = loadAdminContext;
