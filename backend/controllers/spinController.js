const SpinCampaign = require("../models/SpinCampaign");
const SpinAttempt = require("../models/SpinAttempt");
const {
  sendErrorResponse,
  sendSuccessResponse,
  ERROR_CODES,
  HTTP_STATUS,
  asyncHandler,
} = require("../utils/errorHandler");
const {
  ELIGIBILITY,
  getSpinStatus,
  executeSpin,
} = require("../services/spinCampaignService");

function mapEligibilityMessage(eligibility) {
  switch (eligibility) {
    case ELIGIBILITY.ALREADY_SPUN:
      return "You have already spun for this campaign";
    case ELIGIBILITY.CAMPAIGN_INACTIVE:
      return "This spin campaign is not active";
    case ELIGIBILITY.CAMPAIGN_EXPIRED:
      return "This spin campaign has ended";
    case ELIGIBILITY.CAMPAIGN_NOT_STARTED:
      return "This spin campaign has not started yet";
    case ELIGIBILITY.NO_ACTIVE_CAMPAIGN:
      return "No active spin campaign is available";
    default:
      return "Spin is not available";
  }
}

exports.getSpinStatus = asyncHandler(async (req, res) => {
  const shopperId = req.user.id;
  const { campaignId, slug } = req.query;

  const status = await getSpinStatus(shopperId, { campaignId, slug });

  return sendSuccessResponse(res, HTTP_STATUS.OK, "Spin status retrieved", status);
});

exports.spin = asyncHandler(async (req, res) => {
  const shopperId = req.user.id;
  const { campaignId, slug } = req.body || {};

  const result = await executeSpin(shopperId, {
    campaignId,
    slug,
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  if (result.error) {
    return sendErrorResponse(
      res,
      result.status,
      mapEligibilityMessage(result.error),
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      {
        eligibility: result.error,
        attempt: result.attempt || null,
        campaignId: result.campaignId || null,
      }
    );
  }

  return sendSuccessResponse(res, HTTP_STATUS.CREATED, "Spin completed", {
    attempt: result.attempt,
    campaign: result.campaign,
  });
});
