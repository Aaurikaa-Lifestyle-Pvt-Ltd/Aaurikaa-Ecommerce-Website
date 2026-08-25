const {
  sendErrorResponse,
  HTTP_STATUS,
  ERROR_CODES,
} = require("../utils/errorHandler");
const { isMarketplaceSurfaceEnabled } = require("../config/aaurikaaFoundation");

/**
 * Blocks public seller onboarding. Implementation of the handlers is unchanged.
 */
function rejectPublicSellerOnboarding(req, res, next) {
  if (isMarketplaceSurfaceEnabled()) {
    return next();
  }

  return sendErrorResponse(
    res,
    HTTP_STATUS.FORBIDDEN,
    "Public seller registration is disabled.",
    ERROR_CODES.AUTH_ACCESS_DENIED
  );
}

/**
 * Hides the public seller storefront from customers without deleting the route.
 */
function rejectPublicSellerStorefront(req, res, next) {
  if (isMarketplaceSurfaceEnabled()) {
    return next();
  }

  return sendErrorResponse(
    res,
    HTTP_STATUS.NOT_FOUND,
    "Store not found",
    ERROR_CODES.RESOURCE_NOT_FOUND
  );
}

module.exports = {
  rejectPublicSellerOnboarding,
  rejectPublicSellerStorefront,
};
