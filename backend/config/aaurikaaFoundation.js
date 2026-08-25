/**
 * AAURIKAA single-business foundation flags and identity constants.
 *
 * Marketplace HTTP surfaces remain in the codebase but are disabled unless
 * AAURIKAA_ENABLE_MARKETPLACE_SURFACES=true (opt-in compatibility only).
 *
 * Do not put secrets here. Production GSTIN, address, and API credentials
 * are intentionally absent until supplied via env / admin settings.
 */

const INTERNAL_SELLER_USERNAME =
  process.env.AAURIKAA_INTERNAL_SELLER_USERNAME || "aaurikaa-internal";

const INTERNAL_SELLER_EMAIL =
  process.env.AAURIKAA_INTERNAL_SELLER_EMAIL || "ops-internal@aaurikaa.invalid";

const INTERNAL_SELLER_SHOP_NAME = "AAURIKAA";
const INTERNAL_SELLER_SHOP_URL = "aaurikaa";

const DEFAULT_PICKUP_NAME = "AAURIKAA Default Warehouse";

const DEFAULT_PICKUP_SHIPROCKET_ID = Number(
  process.env.AAURIKAA_DEFAULT_PICKUP_SHIPROCKET_ID || 900000001
);

const SITE_TITLE = "AAURIKAA";
const LEGAL_ENTITY_NAME = "AAURIKAA Lifestyles Private Limited";

function isMarketplaceSurfaceEnabled() {
  return process.env.AAURIKAA_ENABLE_MARKETPLACE_SURFACES === "true";
}

function isAaurikaaSingleStoreMode() {
  return process.env.AAURIKAA_SINGLE_STORE_MODE !== "false";
}

module.exports = {
  INTERNAL_SELLER_USERNAME,
  INTERNAL_SELLER_EMAIL,
  INTERNAL_SELLER_SHOP_NAME,
  INTERNAL_SELLER_SHOP_URL,
  DEFAULT_PICKUP_NAME,
  DEFAULT_PICKUP_SHIPROCKET_ID,
  SITE_TITLE,
  LEGAL_ENTITY_NAME,
  isMarketplaceSurfaceEnabled,
  isAaurikaaSingleStoreMode,
};
