const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const Seller = require("../../models/Seller");
const SellerPickupLocation = require("../../models/SellerPickupLocation");
const SiteSettings = require("../../models/SiteSettings");
const pickupLocationService = require("../../services/pickupLocationService");
const {
  INTERNAL_SELLER_USERNAME,
  INTERNAL_SELLER_EMAIL,
  INTERNAL_SELLER_SHOP_NAME,
  DEFAULT_PICKUP_NAME,
  LEGAL_ENTITY_NAME,
  SITE_TITLE,
} = require("../../config/aaurikaaFoundation");
const {
  getOrCreateInternalSeller,
  resolveSellerIdForAaurikaaAdminWrite,
  ensureAaurikaaDefaultPickup,
  ensureAaurikaaSiteIdentity,
  bootstrapAaurikaaFoundation,
} = require("../../services/aaurikaaFoundationService");

describe("AAURIKAA foundation service", () => {
  let mongoServer;

  beforeAll(async () => {
    jest.setTimeout(30000);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Seller.deleteMany({}),
      SellerPickupLocation.deleteMany({}),
      SiteSettings.deleteMany({}),
    ]);
  });

  it("creates an identifiable default pickup that existing resolution can use", async () => {
    const pickup = await ensureAaurikaaDefaultPickup();
    expect(pickup.name).toBe(DEFAULT_PICKUP_NAME);
    expect(pickup.isDefault).toBe(true);
    expect(pickup.isActive).toBe(true);

    const resolved = await pickupLocationService.getDefaultPickup();
    expect(resolved._id.toString()).toBe(pickup._id.toString());

    const forMissingSeller = await pickupLocationService.resolvePickupForSeller(null);
    expect(forMissingSeller._id.toString()).toBe(pickup._id.toString());
  });

  it("creates the internal Seller compatibility record with required identity fields", async () => {
    const seller = await getOrCreateInternalSeller();
    expect(seller.username).toBe(INTERNAL_SELLER_USERNAME);
    expect(seller.email).toBe(INTERNAL_SELLER_EMAIL);
    expect(seller.shopName).toBe(INTERNAL_SELLER_SHOP_NAME);
    expect(seller.isApproved).toBe(true);
    expect(seller.password).toBeFalsy();
    expect(seller.returnAllowed).toBeNull();

    const again = await getOrCreateInternalSeller();
    expect(again._id.toString()).toBe(seller._id.toString());
  });

  it("resolves a missing admin seller selection to the internal Seller", async () => {
    const resolved = await resolveSellerIdForAaurikaaAdminWrite(null);
    const seller = await Seller.findOne({ username: INTERNAL_SELLER_USERNAME });
    expect(resolved).toBe(seller._id.toString());
  });

  it("ignores an explicit seller id and always returns the internal Seller", async () => {
    const other = await Seller.create({
      username: "other-seller",
      email: "other-seller@example.com",
    });
    const resolved = await resolveSellerIdForAaurikaaAdminWrite(other._id.toString());
    const internal = await Seller.findOne({ username: INTERNAL_SELLER_USERNAME });
    expect(resolved).toBe(internal._id.toString());
    expect(resolved).not.toBe(other._id.toString());
  });

  it("configures known SiteSettings identity without inventing GSTIN or address", async () => {
    const settings = await ensureAaurikaaSiteIdentity();
    expect(settings.title).toBe(SITE_TITLE);
    expect(settings.footer.companyName).toBe(LEGAL_ENTITY_NAME);
    expect(settings.footer.gstin).toBe("");
    expect(settings.footer.address).toBe("");
  });

  it("bootstraps seller, pickup, and site identity together", async () => {
    const result = await bootstrapAaurikaaFoundation();
    expect(result.skipped).toBe(false);
    expect(result.sellerId).toBeTruthy();
    expect(result.pickupId).toBeTruthy();
    expect(result.settingsId).toBeTruthy();
  });
});
