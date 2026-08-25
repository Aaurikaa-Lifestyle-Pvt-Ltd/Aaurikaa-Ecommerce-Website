const { getGroupedSuggestions } = require("../services/search/globalSearchService");
const { isSuggestionTermValid } = require("../services/search/searchUtils");
const {
  sendErrorResponse,
  HTTP_STATUS,
  ERROR_CODES,
  asyncHandler,
} = require("../utils/errorHandler");

/**
 * GET /api/search/suggestions?q=&locale=
 * Returns grouped autocomplete sections for the storefront search bar.
 */
exports.getSuggestions = asyncHandler(async (req, res) => {
  const { q, locale } = req.query;

  if (!isSuggestionTermValid(q)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Search term must be at least 2 characters",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  try {
    const suggestions = await getGroupedSuggestions(q, { locale });
    if (!suggestions) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Search term must be at least 2 characters",
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }
    return res.json(suggestions);
  } catch (err) {
    console.error("Global search suggestions error:", err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Search suggestions failed",
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
});
