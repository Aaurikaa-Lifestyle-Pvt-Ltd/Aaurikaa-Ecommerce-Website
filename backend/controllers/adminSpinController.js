const SpinCampaign = require("../models/SpinCampaign");
const SpinAttempt = require("../models/SpinAttempt");
const {
  sendErrorResponse,
  sendSuccessResponse,
  ERROR_MESSAGES,
  ERROR_CODES,
  HTTP_STATUS,
  asyncHandler,
} = require("../utils/errorHandler");
const {
  normalizeSlug,
  validateCampaignPayload,
  sanitizeCampaignForShopper,
  getCampaignWindowState,
  parseCampaignCalendarDate,
  resolveCampaign,
  ELIGIBILITY,
} = require("../services/spinCampaignService");

function buildCampaignPayload(body, adminId) {
  const payload = {
    name: body.name,
    slug: normalizeSlug(body.slug || body.name),
    status: body.status || "draft",
    startDate: parseCampaignCalendarDate(body.startDate, "start"),
    endDate: parseCampaignCalendarDate(body.endDate, "end"),
    headline: body.headline || "",
    description: body.description || "",
    couponCodePrefix: body.couponCodePrefix || "",
    segments: Array.isArray(body.segments) ? body.segments : [],
    createdBy: adminId,
  };

  return payload;
}

exports.listCampaigns = asyncHandler(async (req, res) => {
  const campaigns = await SpinCampaign.find().sort({ updatedAt: -1 }).lean();
  return sendSuccessResponse(res, HTTP_STATUS.OK, "Spin campaigns retrieved", campaigns);
});

exports.getCampaign = asyncHandler(async (req, res) => {
  const campaign = await SpinCampaign.findById(req.params.id).lean();
  if (!campaign) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.RESOURCE_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  return sendSuccessResponse(res, HTTP_STATUS.OK, "Spin campaign retrieved", campaign);
});

exports.createCampaign = asyncHandler(async (req, res) => {
  const payload = buildCampaignPayload(req.body, req.adminUser?.id || req.user?.id);
  const validationErrors = validateCampaignPayload(payload);
  if (validationErrors.length > 0) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      validationErrors.join("; "),
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS,
      { validationErrors }
    );
  }

  const slugExists = await SpinCampaign.findOne({ slug: payload.slug }).select("_id").lean();
  if (slugExists) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.CONFLICT,
      "Campaign slug already exists",
      ERROR_CODES.RESOURCE_ALREADY_EXISTS
    );
  }

  const campaign = await SpinCampaign.create(payload);
  return sendSuccessResponse(
    res,
    HTTP_STATUS.CREATED,
    "Spin campaign created",
    campaign
  );
});

exports.updateCampaign = asyncHandler(async (req, res) => {
  const campaign = await SpinCampaign.findById(req.params.id);
  if (!campaign) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.RESOURCE_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  const nextPayload = {
    name: req.body.name ?? campaign.name,
    slug: normalizeSlug(req.body.slug ?? campaign.slug),
    status: req.body.status ?? campaign.status,
    startDate:
      req.body.startDate !== undefined
        ? parseCampaignCalendarDate(req.body.startDate, "start")
        : campaign.startDate,
    endDate:
      req.body.endDate !== undefined
        ? parseCampaignCalendarDate(req.body.endDate, "end")
        : campaign.endDate,
    headline: req.body.headline ?? campaign.headline,
    description: req.body.description ?? campaign.description,
    couponCodePrefix: req.body.couponCodePrefix ?? campaign.couponCodePrefix,
    segments: req.body.segments ?? campaign.segments,
  };

  const validationErrors = validateCampaignPayload(nextPayload);
  if (validationErrors.length > 0) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      validationErrors.join("; "),
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS,
      { validationErrors }
    );
  }

  if (nextPayload.slug !== campaign.slug) {
    const slugExists = await SpinCampaign.findOne({
      slug: nextPayload.slug,
      _id: { $ne: campaign._id },
    })
      .select("_id")
      .lean();
    if (slugExists) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.CONFLICT,
        "Campaign slug already exists",
        ERROR_CODES.RESOURCE_ALREADY_EXISTS
      );
    }
  }

  Object.assign(campaign, nextPayload);
  await campaign.save();

  return sendSuccessResponse(res, HTTP_STATUS.OK, "Spin campaign updated", campaign);
});

exports.updateCampaignStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["draft", "active", "ended", "disabled"].includes(status)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid campaign status",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const campaign = await SpinCampaign.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );

  if (!campaign) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.RESOURCE_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  return sendSuccessResponse(res, HTTP_STATUS.OK, "Spin campaign status updated", campaign);
});

exports.deleteCampaign = asyncHandler(async (req, res) => {
  const campaign = await SpinCampaign.findById(req.params.id);
  if (!campaign) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.RESOURCE_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  const attemptCount = await SpinAttempt.countDocuments({ campaignId: campaign._id });
  if (attemptCount > 0) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.CONFLICT,
      "Cannot delete a campaign that already has spin attempts",
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      { attemptCount }
    );
  }

  await campaign.deleteOne();
  return sendSuccessResponse(res, HTTP_STATUS.OK, "Spin campaign deleted");
});

exports.listAttempts = asyncHandler(async (req, res) => {
  const campaign = await SpinCampaign.findById(req.params.id).lean();
  if (!campaign) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      ERROR_MESSAGES.RESOURCE_NOT_FOUND,
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const [attempts, total] = await Promise.all([
    SpinAttempt.find({ campaignId: campaign._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("shopperId", "username email firstName lastName")
      .lean(),
    SpinAttempt.countDocuments({ campaignId: campaign._id }),
  ]);

  const items = attempts.map((attempt) => {
    const segment = (campaign.segments || []).find(
      (item) => String(item._id) === String(attempt.segmentId)
    );

    return {
      id: attempt._id,
      campaignId: attempt.campaignId,
      shopper: attempt.shopperId,
      segmentId: attempt.segmentId,
      segmentLabel: segment?.label || null,
      outcome: attempt.outcome,
      couponId: attempt.couponId,
      couponCode: attempt.couponCode,
      ipAddress: attempt.ipAddress,
      userAgent: attempt.userAgent,
      createdAt: attempt.createdAt,
    };
  });

  return sendSuccessResponse(res, HTTP_STATUS.OK, "Spin attempts retrieved", {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

/** Public-safe active campaign preview (no weights, auth not required). */
exports.getActiveCampaignPreview = asyncHandler(async (req, res) => {
  const { slug } = req.query;
  const campaign = await resolveCampaign({
    slug: slug ? String(slug) : undefined,
  });

  if (!campaign || getCampaignWindowState(campaign) !== ELIGIBILITY.ELIGIBLE) {
    return sendSuccessResponse(res, HTTP_STATUS.OK, "No active spin campaign", {
      campaign: null,
    });
  }

  return sendSuccessResponse(res, HTTP_STATUS.OK, "Active spin campaign preview", {
    campaign: sanitizeCampaignForShopper(campaign),
  });
});
