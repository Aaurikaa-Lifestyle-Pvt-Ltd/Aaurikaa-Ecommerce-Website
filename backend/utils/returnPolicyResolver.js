/**
 * Resolve effective return policy: Seller default → Product override.
 * Platform/global return policy is retired — sellers must configure explicitly.
 * Order-level cases use the most permissive allow among line items and the
 * shortest window among allowed items.
 */

const {
  normalizeReturnWindowDays,
  DEFAULT_RETURN_WINDOW_DAYS,
} = require("../services/returnEligibilityService");

const RETURN_POLICY_MODE_INHERIT = "inherit";
const RETURN_POLICY_MODE_OVERRIDE = "override";
const RETURN_POLICY_MODES = [RETURN_POLICY_MODE_INHERIT, RETURN_POLICY_MODE_OVERRIDE];

const SELLER_POLICY_REQUIRED_MESSAGE =
  "Configure your shop return policy in Shop Settings before publishing products. Choose whether returns are allowed and, if allowed, set your return window and conditions.";

function toPlain(doc) {
  if (!doc) return null;
  return typeof doc.toObject === "function" ? doc.toObject() : doc;
}

function parseOptionalBoolean(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "allowed"].includes(normalized)) return true;
  if (["false", "0", "no", "not_allowed", "not-allowed"].includes(normalized)) {
    return false;
  }
  return null;
}

function parseOptionalReturnWindowDays(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > 365) return null;
  return parsed;
}

function normalizeReturnConditions(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed.slice(0, 2000) : null;
}

/**
 * Seller return policy is mandatory and must be explicit (no platform inherit).
 * returnAllowed: false is a complete policy; returnAllowed: true requires window + conditions.
 */
function isSellerReturnPolicyConfigured(seller) {
  const plain = toPlain(seller) || {};
  const allowed = parseOptionalBoolean(plain.returnAllowed);
  if (allowed === null) return false;
  if (allowed === false) return true;
  const days = parseOptionalReturnWindowDays(plain.returnWindowDays);
  const conditions = normalizeReturnConditions(plain.returnConditions);
  return days !== null && conditions !== null;
}

function resolveSellerReturnPolicy(seller) {
  const plain = toPlain(seller) || {};
  if (!isSellerReturnPolicyConfigured(plain)) {
    return {
      returnAllowed: false,
      returnWindowDays: null,
      returnConditions: null,
      source: "seller_unconfigured",
      configured: false,
    };
  }

  return {
    returnAllowed: parseOptionalBoolean(plain.returnAllowed),
    returnWindowDays: parseOptionalReturnWindowDays(plain.returnWindowDays),
    returnConditions: normalizeReturnConditions(plain.returnConditions),
    source: "seller",
    configured: true,
  };
}

/**
 * @deprecated Platform return policy retired. Kept as a no-op stub for transitional callers.
 */
function resolvePlatformReturnPolicy() {
  return {
    returnAllowed: false,
    returnWindowDays: null,
    returnConditions: null,
    source: "platform_retired",
    configured: false,
  };
}

/**
 * Resolve effective policy for a single product.
 * Product override wins when returnPolicyMode === "override"; otherwise seller defaults.
 * No platform fallback.
 */
function resolveProductReturnPolicy({ product, seller } = {}) {
  const sellerPolicy = resolveSellerReturnPolicy(seller);
  const productPlain = toPlain(product) || {};

  const mode =
    productPlain.returnPolicyMode === RETURN_POLICY_MODE_OVERRIDE
      ? RETURN_POLICY_MODE_OVERRIDE
      : RETURN_POLICY_MODE_INHERIT;

  if (mode === RETURN_POLICY_MODE_OVERRIDE) {
    if (!sellerPolicy.configured) {
      return { ...sellerPolicy };
    }

    const productAllowed = parseOptionalBoolean(productPlain.returnAllowed);
    const productDays = parseOptionalReturnWindowDays(productPlain.returnWindowDays);
    const productConditions = normalizeReturnConditions(productPlain.returnConditions);

    return {
      returnAllowed:
        productAllowed !== null ? productAllowed : sellerPolicy.returnAllowed,
      returnWindowDays:
        productDays !== null ? productDays : sellerPolicy.returnWindowDays,
      returnConditions:
        productConditions !== null
          ? productConditions
          : sellerPolicy.returnConditions,
      source: "product",
      configured: true,
    };
  }

  return sellerPolicy;
}

/**
 * Aggregate line-item policies for an order-level after-sales case.
 * Eligible if any line item allows returns; window is the min among allowed items.
 */
function resolveOrderReturnPolicy({ order } = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];

  if (items.length === 0) {
    return {
      returnAllowed: false,
      returnWindowDays: null,
      returnConditions: null,
      source: "order",
      configured: false,
    };
  }

  const policies = items.map((item) => {
    const product =
      item?.product && typeof item.product === "object" ? item.product : {};
    const seller =
      product?.seller && typeof product.seller === "object"
        ? product.seller
        : null;
    return resolveProductReturnPolicy({ product, seller });
  });

  const configured = policies.filter((policy) => policy.configured);
  if (configured.length === 0) {
    return {
      returnAllowed: false,
      returnWindowDays: null,
      returnConditions: null,
      source: "seller_unconfigured",
      configured: false,
    };
  }

  const allowed = configured.filter((policy) => policy.returnAllowed);
  if (allowed.length === 0) {
    return {
      returnAllowed: false,
      returnWindowDays: configured[0].returnWindowDays,
      returnConditions: configured[0].returnConditions,
      source: "order",
      configured: true,
    };
  }

  const windows = allowed
    .map((policy) => policy.returnWindowDays)
    .filter((days) => Number.isInteger(days));

  return {
    returnAllowed: true,
    returnWindowDays:
      windows.length > 0
        ? Math.min(...windows)
        : normalizeReturnWindowDays(DEFAULT_RETURN_WINDOW_DAYS),
    returnConditions: allowed[0].returnConditions || null,
    source: "order",
    configured: true,
  };
}

/**
 * Normalize product write payload fields (multipart strings → typed values).
 */
function normalizeProductReturnPolicyFields(body = {}) {
  const modeRaw = body.returnPolicyMode;
  const mode =
    String(modeRaw || RETURN_POLICY_MODE_INHERIT).trim().toLowerCase() ===
    RETURN_POLICY_MODE_OVERRIDE
      ? RETURN_POLICY_MODE_OVERRIDE
      : RETURN_POLICY_MODE_INHERIT;

  if (mode === RETURN_POLICY_MODE_INHERIT) {
    return {
      valid: true,
      returnPolicyMode: RETURN_POLICY_MODE_INHERIT,
      returnAllowed: null,
      returnWindowDays: null,
      returnConditions: null,
    };
  }

  const returnAllowed = parseOptionalBoolean(body.returnAllowed);
  const returnWindowDays = parseOptionalReturnWindowDays(body.returnWindowDays);
  const returnConditions = normalizeReturnConditions(body.returnConditions);

  if (returnAllowed === null) {
    return {
      valid: false,
      message: "Return allowed is required when product return policy overrides seller defaults.",
    };
  }

  if (returnAllowed === true && returnWindowDays === null) {
    return {
      valid: false,
      message:
        "Return window (1–365 days) is required when product return policy overrides seller defaults.",
    };
  }

  const result = {
    valid: true,
    returnPolicyMode: RETURN_POLICY_MODE_OVERRIDE,
    returnAllowed,
  };

  if (returnWindowDays !== null) {
    result.returnWindowDays = returnWindowDays;
  }
  if (returnConditions !== null) {
    result.returnConditions = returnConditions;
  }

  return result;
}

/**
 * Normalize seller default policy fields for profile updates.
 * returnAllowed is always required when updating return policy.
 * When returnAllowed is true, window and conditions are required.
 * When returnAllowed is false, window/conditions are optional (omitted when empty).
 */
function normalizeSellerReturnPolicyFields(body = {}) {
  const hasAllowed = body.returnAllowed !== undefined;
  const hasWindow = body.returnWindowDays !== undefined;
  const hasConditions = body.returnConditions !== undefined;

  if (!hasAllowed && !hasWindow && !hasConditions) {
    return { changed: false };
  }

  const result = { changed: true };
  let effectiveAllowed = null;

  if (hasAllowed) {
    const raw = body.returnAllowed;
    if (raw === "" || raw === "inherit" || raw === null) {
      return {
        changed: true,
        valid: false,
        message:
          "Seller return allowed is required. Choose Allowed or Not allowed (platform inherit is retired).",
      };
    }
    const parsed = parseOptionalBoolean(raw);
    if (parsed === null) {
      return {
        changed: true,
        valid: false,
        message: "Seller return allowed must be true or false.",
      };
    }
    result.returnAllowed = parsed;
    effectiveAllowed = parsed;
  }

  if (hasWindow) {
    const raw = body.returnWindowDays;
    const isEmpty = raw === "" || raw === "inherit" || raw === null;

    if (isEmpty) {
      if (effectiveAllowed === true) {
        return {
          changed: true,
          valid: false,
          message:
            "Seller return window is required (whole number between 1 and 365). Platform inherit is retired.",
        };
      }
      // returnAllowed false or partial update without returnAllowed — skip empty window
    } else {
      const parsed = parseOptionalReturnWindowDays(raw);
      if (parsed === null) {
        return {
          changed: true,
          valid: false,
          message: "Seller return window must be a whole number between 1 and 365.",
        };
      }
      result.returnWindowDays = parsed;
    }
  }

  if (hasConditions) {
    const conditions = normalizeReturnConditions(body.returnConditions);
    if (!conditions) {
      if (effectiveAllowed === true) {
        return {
          changed: true,
          valid: false,
          message: "Seller return conditions are required.",
        };
      }
      // returnAllowed false or partial update without returnAllowed — skip empty conditions
    } else {
      result.returnConditions = conditions;
    }
  }

  result.valid = true;
  return result;
}

/**
 * Validate that a seller document has a complete mandatory return policy.
 * Used before first product publish / onboarding gate.
 */
function assertSellerReturnPolicyReady(seller) {
  if (isSellerReturnPolicyConfigured(seller)) {
    return { valid: true };
  }
  return {
    valid: false,
    message: SELLER_POLICY_REQUIRED_MESSAGE,
  };
}

module.exports = {
  RETURN_POLICY_MODE_INHERIT,
  RETURN_POLICY_MODE_OVERRIDE,
  RETURN_POLICY_MODES,
  SELLER_POLICY_REQUIRED_MESSAGE,
  resolvePlatformReturnPolicy,
  resolveSellerReturnPolicy,
  resolveProductReturnPolicy,
  resolveOrderReturnPolicy,
  normalizeProductReturnPolicyFields,
  normalizeSellerReturnPolicyFields,
  isSellerReturnPolicyConfigured,
  assertSellerReturnPolicyReady,
  parseOptionalBoolean,
  parseOptionalReturnWindowDays,
  normalizeReturnConditions,
};
