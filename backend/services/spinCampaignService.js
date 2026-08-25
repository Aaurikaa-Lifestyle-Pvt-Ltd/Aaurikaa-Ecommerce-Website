const crypto = require("crypto");
const SpinCampaign = require("../models/SpinCampaign");
const SpinAttempt = require("../models/SpinAttempt");
const Coupon = require("../models/coupon");
const { validateCouponData } = require("../utils/pricingValidator");

const ELIGIBILITY = {
  ELIGIBLE: "eligible",
  ALREADY_SPUN: "already_spun",
  CAMPAIGN_INACTIVE: "campaign_inactive",
  CAMPAIGN_EXPIRED: "campaign_expired",
  CAMPAIGN_NOT_STARTED: "campaign_not_started",
  NO_ACTIVE_CAMPAIGN: "no_active_campaign",
};

/** AAURIKAA business calendar (India). Matches return-window IST day semantics. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function normalizeSlug(slug) {
  return String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toIstCalendarParts(date) {
  const ist = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth(),
    day: ist.getUTCDate(),
  };
}

function istStartOfCalendarDay(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0) - IST_OFFSET_MS);
}

function istEndOfCalendarDay(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day, 23, 59, 59, 999) - IST_OFFSET_MS);
}

/**
 * Admin date inputs are calendar days (YYYY-MM-DD). Persist inclusive IST bounds
 * so "26 Aug → 27 Aug" is live for those full India calendar days.
 */
function parseCampaignCalendarDate(value, bound) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  const dateOnly = DATE_ONLY_RE.exec(raw);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const monthIndex = Number(dateOnly[2]) - 1;
    const day = Number(dateOnly[3]);
    return bound === "end"
      ? istEndOfCalendarDay(year, monthIndex, day)
      : istStartOfCalendarDay(year, monthIndex, day);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = toIstCalendarParts(parsed);
  return bound === "end"
    ? istEndOfCalendarDay(parts.year, parts.month, parts.day)
    : istStartOfCalendarDay(parts.year, parts.month, parts.day);
}

function getCampaignWindowBounds(campaign) {
  let startBound = null;
  let endBound = null;

  if (campaign?.startDate) {
    const parts = toIstCalendarParts(campaign.startDate);
    startBound = istStartOfCalendarDay(parts.year, parts.month, parts.day);
  }
  if (campaign?.endDate) {
    const parts = toIstCalendarParts(campaign.endDate);
    endBound = istEndOfCalendarDay(parts.year, parts.month, parts.day);
  }

  return { startBound, endBound };
}

function getCampaignWindowState(campaign, now = new Date()) {
  if (!campaign || campaign.status !== "active") {
    return ELIGIBILITY.CAMPAIGN_INACTIVE;
  }

  const { startBound, endBound } = getCampaignWindowBounds(campaign);
  if (startBound && now < startBound) {
    return ELIGIBILITY.CAMPAIGN_NOT_STARTED;
  }
  if (endBound && now > endBound) {
    return ELIGIBILITY.CAMPAIGN_EXPIRED;
  }
  return ELIGIBILITY.ELIGIBLE;
}

function pickWeightedSegment(segments, rng = Math.random) {
  const weighted = (segments || []).filter((segment) => Number(segment.weight) > 0);
  if (weighted.length === 0) {
    throw new Error("Campaign has no segments with positive weight");
  }

  const totalWeight = weighted.reduce((sum, segment) => sum + Number(segment.weight), 0);
  let cursor = rng() * totalWeight;

  for (const segment of weighted) {
    cursor -= Number(segment.weight);
    if (cursor <= 0) {
      return segment;
    }
  }

  return weighted[weighted.length - 1];
}

function mapSegmentOutcome(segment) {
  if (segment.type === "coupon") return "win";
  if (segment.type === "lose") return "lose";
  return "no_reward";
}

function buildCouponValidity(template, issuedAt = new Date()) {
  const validFrom = new Date(issuedAt);
  const validTo = new Date(issuedAt);
  validTo.setDate(validTo.getDate() + Number(template.validityDays));
  return { validFrom, validTo };
}

async function generateUniqueCouponCode(prefix) {
  const safePrefix = String(prefix || "SPIN")
    .replace(/[^A-Z0-9-]/gi, "")
    .toUpperCase()
    .slice(0, 20);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
    const code = safePrefix ? `${safePrefix}-${suffix}` : suffix;
    const exists = await Coupon.findOne({ code }).select("_id").lean();
    if (!exists) {
      return code;
    }
  }

  throw new Error("Unable to generate unique coupon code");
}

function validateSegmentCouponTemplate(segment, index) {
  if (segment.type !== "coupon") {
    return null;
  }

  if (!segment.couponTemplate) {
    throw new Error(`Segment ${index + 1} (${segment.label}) requires couponTemplate`);
  }

  const { validFrom, validTo } = buildCouponValidity(segment.couponTemplate);
  const validation = validateCouponData({
    code: "SPINPLACEHOLDER",
    discountType: segment.couponTemplate.discountType,
    discountValue: segment.couponTemplate.discountValue,
    minOrder: segment.couponTemplate.minOrder ?? 0,
    validFrom,
    validTo,
    freeShipping: segment.couponTemplate.freeShipping ?? false,
  });

  if (validation.hasErrors()) {
    const message = validation.errors.map((error) => error.message).join("; ");
    throw new Error(`Segment ${index + 1} (${segment.label}): ${message}`);
  }

  return null;
}

function validateCampaignPayload(payload, { partial = false } = {}) {
  const errors = [];

  if (!partial || payload.name !== undefined) {
    if (!payload.name || typeof payload.name !== "string" || !payload.name.trim()) {
      errors.push("Campaign name is required");
    }
  }

  if (!partial || payload.slug !== undefined) {
    const slug = normalizeSlug(payload.slug);
    if (!slug) {
      errors.push("Campaign slug is required");
    }
  }

  if (!partial || payload.segments !== undefined) {
    const segments = payload.segments;
    if (!Array.isArray(segments) || segments.length === 0) {
      errors.push("At least one segment is required");
    } else {
      let totalWeight = 0;
      segments.forEach((segment, index) => {
        if (!segment.label || typeof segment.label !== "string") {
          errors.push(`Segment ${index + 1} label is required`);
        }
        if (!["coupon", "lose", "no_reward"].includes(segment.type)) {
          errors.push(`Segment ${index + 1} has invalid type`);
        }
        if (typeof segment.weight !== "number" || Number.isNaN(segment.weight) || segment.weight < 0) {
          errors.push(`Segment ${index + 1} weight must be a non-negative number`);
        } else {
          totalWeight += segment.weight;
        }

        if (segment.type === "coupon") {
          try {
            validateSegmentCouponTemplate(segment, index);
          } catch (validationError) {
            errors.push(validationError.message);
          }
        }
      });

      if (totalWeight <= 0) {
        errors.push("Total segment weight must be greater than zero");
      }
    }
  }

  if (payload.startDate && payload.endDate) {
    const start = new Date(payload.startDate);
    const end = new Date(payload.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      errors.push("Campaign startDate and endDate must be valid dates");
    } else if (start >= end) {
      errors.push("Campaign startDate must be before endDate");
    }
  }

  if (payload.status && !["draft", "active", "ended", "disabled"].includes(payload.status)) {
    errors.push("Invalid campaign status");
  }

  return errors;
}

function sanitizeCampaignForShopper(campaign) {
  if (!campaign) return null;

  const plain = campaign.toObject ? campaign.toObject() : { ...campaign };
  return {
    id: plain._id,
    name: plain.name,
    slug: plain.slug,
    headline: plain.headline,
    description: plain.description,
    startDate: plain.startDate,
    endDate: plain.endDate,
    segments: (plain.segments || []).map((segment) => ({
      id: segment._id,
      label: segment.label,
      displayMessage: segment.displayMessage,
    })),
  };
}

function sanitizeAttemptForShopper(attempt, campaign) {
  if (!attempt) return null;

  const plain = attempt.toObject ? attempt.toObject() : { ...attempt };
  const segment = (campaign?.segments || []).find(
    (item) => String(item._id) === String(plain.segmentId)
  );

  return {
    id: plain._id,
    outcome: plain.outcome,
    segmentId: plain.segmentId,
    segmentLabel: segment?.label || null,
    displayMessage: segment?.displayMessage || null,
    couponCode: plain.outcome === "win" ? plain.couponCode : null,
    spunAt: plain.createdAt,
  };
}

async function resolveCampaign({ campaignId, slug } = {}) {
  if (campaignId) {
    return SpinCampaign.findById(campaignId);
  }
  if (slug) {
    return SpinCampaign.findOne({ slug: normalizeSlug(slug) });
  }

  // Status-only query: IST calendar-day window is applied in getCampaignWindowState.
  // Raw UTC midnight comparisons incorrectly hide "today" campaigns before ~05:30 IST.
  const candidates = await SpinCampaign.find({ status: "active" }).sort({ updatedAt: -1 });
  return candidates.find((campaign) => getCampaignWindowState(campaign) === ELIGIBILITY.ELIGIBLE) || null;
}

async function getSpinStatus(shopperId, { campaignId, slug } = {}) {
  const campaign = await resolveCampaign({ campaignId, slug });

  if (!campaign) {
    return {
      eligibility: ELIGIBILITY.NO_ACTIVE_CAMPAIGN,
      campaign: null,
      attempt: null,
    };
  }

  const windowState = getCampaignWindowState(campaign);
  const existingAttempt = await SpinAttempt.findOne({
    campaignId: campaign._id,
    shopperId,
  }).lean();

  if (existingAttempt) {
    return {
      eligibility: ELIGIBILITY.ALREADY_SPUN,
      campaign: sanitizeCampaignForShopper(campaign),
      attempt: sanitizeAttemptForShopper(existingAttempt, campaign),
    };
  }

  if (windowState !== ELIGIBILITY.ELIGIBLE) {
    return {
      eligibility: windowState,
      campaign: sanitizeCampaignForShopper(campaign),
      attempt: null,
    };
  }

  return {
    eligibility: ELIGIBILITY.ELIGIBLE,
    campaign: sanitizeCampaignForShopper(campaign),
    attempt: null,
  };
}

async function issueSpinCoupon(campaign, segment) {
  const code = await generateUniqueCouponCode(campaign.couponCodePrefix);
  const { validFrom, validTo } = buildCouponValidity(segment.couponTemplate);

  const coupon = await Coupon.create({
    code,
    discountType: segment.couponTemplate.discountType,
    discountValue: segment.couponTemplate.discountValue,
    minOrder: segment.couponTemplate.minOrder ?? 0,
    freeShipping: segment.couponTemplate.freeShipping ?? false,
    validFrom,
    validTo,
    usageLimit: 1,
    perUserLimit: 1,
    isActive: true,
  });

  return coupon;
}

async function executeSpin(shopperId, { campaignId, slug, ipAddress, userAgent, rng = Math.random } = {}) {
  const campaign = await resolveCampaign({ campaignId, slug });
  if (!campaign) {
    return { error: "NO_ACTIVE_CAMPAIGN", status: 404 };
  }

  const windowState = getCampaignWindowState(campaign);
  if (windowState !== ELIGIBILITY.ELIGIBLE) {
    return { error: windowState, status: 400, campaignId: campaign._id };
  }

  const existingAttempt = await SpinAttempt.findOne({
    campaignId: campaign._id,
    shopperId,
  }).lean();

  if (existingAttempt) {
    return {
      error: ELIGIBILITY.ALREADY_SPUN,
      status: 409,
      attempt: sanitizeAttemptForShopper(existingAttempt, campaign),
    };
  }

  const chosenSegment = pickWeightedSegment(campaign.segments, rng);
  const outcome = mapSegmentOutcome(chosenSegment);

  const attemptDoc = new SpinAttempt({
    campaignId: campaign._id,
    shopperId,
    segmentId: chosenSegment._id,
    outcome,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
  });

  try {
    await attemptDoc.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const duplicateAttempt = await SpinAttempt.findOne({
        campaignId: campaign._id,
        shopperId,
      }).lean();

      return {
        error: ELIGIBILITY.ALREADY_SPUN,
        status: 409,
        attempt: sanitizeAttemptForShopper(duplicateAttempt, campaign),
      };
    }
    throw error;
  }

  if (outcome === "win") {
    try {
      const coupon = await issueSpinCoupon(campaign, chosenSegment);
      attemptDoc.couponId = coupon._id;
      attemptDoc.couponCode = coupon.code;
      await attemptDoc.save();
    } catch (couponError) {
      await SpinAttempt.deleteOne({ _id: attemptDoc._id });
      throw couponError;
    }
  }

  return {
    attempt: sanitizeAttemptForShopper(attemptDoc, campaign),
    campaign: sanitizeCampaignForShopper(campaign),
  };
}

module.exports = {
  ELIGIBILITY,
  normalizeSlug,
  parseCampaignCalendarDate,
  validateCampaignPayload,
  validateSegmentCouponTemplate,
  getCampaignWindowState,
  getCampaignWindowBounds,
  pickWeightedSegment,
  mapSegmentOutcome,
  resolveCampaign,
  getSpinStatus,
  executeSpin,
  sanitizeCampaignForShopper,
  sanitizeAttemptForShopper,
};
