const Seller = require("../models/Seller");
const SellerPickupLocation = require("../models/SellerPickupLocation");
const SiteSettings = require("../models/SiteSettings");
const {
  INTERNAL_SELLER_USERNAME,
  INTERNAL_SELLER_EMAIL,
  INTERNAL_SELLER_SHOP_NAME,
  INTERNAL_SELLER_SHOP_URL,
  DEFAULT_PICKUP_NAME,
  DEFAULT_PICKUP_SHIPROCKET_ID,
  SITE_TITLE,
  LEGAL_ENTITY_NAME,
  isAaurikaaSingleStoreMode,
} = require("../config/aaurikaaFoundation");

const LEGACY_IDENTITY_RE = /anbazar|multi-vendor|multivendor/i;

function isUnsetOrLegacyIdentity(value) {
  if (value == null) return true;
  const trimmed = String(value).trim();
  if (!trimmed) return true;
  return LEGACY_IDENTITY_RE.test(trimmed);
}

/**
 * Ensure one default AAURIKAA pickup location exists.
 * Does not call Shiprocket. Placeholder shiprocketId is used until real sync.
 */
async function ensureAaurikaaDefaultPickup() {
  let pickup = await SellerPickupLocation.findOne({ isDefault: true, isActive: true });
  if (pickup) {
    return pickup;
  }

  pickup = await SellerPickupLocation.findOne({ isDefault: true });
  if (pickup) {
    pickup.isActive = true;
    await pickup.save();
    return pickup;
  }

  pickup = await SellerPickupLocation.findOne({
    $or: [
      { name: DEFAULT_PICKUP_NAME },
      { shiprocketId: DEFAULT_PICKUP_SHIPROCKET_ID },
    ],
  });

  if (pickup) {
    pickup.isDefault = true;
    pickup.isActive = true;
    if (!pickup.name) pickup.name = DEFAULT_PICKUP_NAME;
    await pickup.save();
    return pickup;
  }

  pickup = await SellerPickupLocation.create({
    shiprocketId: DEFAULT_PICKUP_SHIPROCKET_ID,
    name: DEFAULT_PICKUP_NAME,
    address: {
      address: "PENDING_CONFIGURATION",
      city: "PENDING_CONFIGURATION",
      state: "PENDING_CONFIGURATION",
      country: "India",
      pincode: "000000",
    },
    phone: "",
    email: "",
    isDefault: true,
    isActive: true,
  });

  return pickup;
}

async function findInternalSeller() {
  return Seller.findOne({
    $or: [
      { username: INTERNAL_SELLER_USERNAME },
      { email: INTERNAL_SELLER_EMAIL },
      { shopUrl: INTERNAL_SELLER_SHOP_URL },
    ],
  });
}

/**
 * One approved Seller used as AAURIKAA store compatibility identity.
 * No login password is stored — this is not a marketplace actor.
 * Return policy and GST origin state are left unset until business values exist.
 */
async function getOrCreateInternalSeller() {
  let seller = await findInternalSeller();

  if (!seller) {
    try {
      seller = await Seller.create({
        username: INTERNAL_SELLER_USERNAME,
        email: INTERNAL_SELLER_EMAIL,
        firstName: INTERNAL_SELLER_SHOP_NAME,
        lastName: "Store",
        shopName: INTERNAL_SELLER_SHOP_NAME,
        shopUrl: INTERNAL_SELLER_SHOP_URL,
        isApproved: true,
        isVerified: false,
        commission: 0,
      });
    } catch (err) {
      if (err && err.code === 11000) {
        seller = await findInternalSeller();
      }
      if (!seller) throw err;
    }
  }

  let dirty = false;
  if (!seller.isApproved) {
    seller.isApproved = true;
    dirty = true;
  }
  if (!seller.shopName) {
    seller.shopName = INTERNAL_SELLER_SHOP_NAME;
    dirty = true;
  }
  if (!seller.shopUrl) {
    seller.shopUrl = INTERNAL_SELLER_SHOP_URL;
    dirty = true;
  }

  if (!seller.pickupLocation) {
    const pickup = await ensureAaurikaaDefaultPickup();
    if (pickup) {
      seller.pickupLocation = pickup._id;
      dirty = true;
      if (!pickup.seller) {
        pickup.seller = seller._id;
        await pickup.save();
      }
    }
  }

  if (dirty) {
    await seller.save();
  }

  return seller;
}

/**
 * Resolve Product.seller for AAURIKAA admin catalogue writes.
 * Client-supplied sellerId / sellerShop is ignored in single-store mode.
 */
async function resolveSellerIdForAaurikaaAdminWrite(_requestedSellerId) {
  if (!isAaurikaaSingleStoreMode()) {
    return _requestedSellerId || null;
  }
  const seller = await getOrCreateInternalSeller();
  return seller._id.toString();
}

/**
 * Apply only known AAURIKAA identity onto SiteSettings.
 * Does not invent GSTIN, address, phone, refund policy, or payment credentials.
 */
async function ensureAaurikaaSiteIdentity() {
  let settings = await SiteSettings.findOne().sort({ createdAt: 1 });
  if (!settings) {
    settings = new SiteSettings();
  }

  let dirty = false;

  if (isUnsetOrLegacyIdentity(settings.title)) {
    settings.title = SITE_TITLE;
    dirty = true;
  }

  if (!settings.footer) {
    settings.footer = {};
    dirty = true;
  }

  if (isUnsetOrLegacyIdentity(settings.footer.companyName)) {
    settings.footer.companyName = LEGAL_ENTITY_NAME;
    dirty = true;
  }

  if (dirty) {
    await settings.save();
  }

  return settings;
}

async function bootstrapAaurikaaFoundation() {
  if (!isAaurikaaSingleStoreMode()) {
    return { skipped: true };
  }

  const settings = await ensureAaurikaaSiteIdentity();
  const pickup = await ensureAaurikaaDefaultPickup();
  const seller = await getOrCreateInternalSeller();

  return {
    skipped: false,
    settingsId: settings?._id || null,
    pickupId: pickup?._id || null,
    sellerId: seller?._id || null,
  };
}

module.exports = {
  ensureAaurikaaDefaultPickup,
  getOrCreateInternalSeller,
  resolveSellerIdForAaurikaaAdminWrite,
  ensureAaurikaaSiteIdentity,
  bootstrapAaurikaaFoundation,
};
