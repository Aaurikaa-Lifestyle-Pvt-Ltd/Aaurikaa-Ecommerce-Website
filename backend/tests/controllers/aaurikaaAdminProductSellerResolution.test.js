jest.mock("../../utils/skuGenerator", () => ({
  generateSku: jest.fn().mockResolvedValue("AAU-FOUNDATION-SKU-1"),
  buildSkuProductSnapshot: jest.fn(),
}));

jest.mock("../../utils/catalogShippingValidation", () => ({
  validateProductWeightClass: jest.fn().mockResolvedValue({ valid: true, value: null }),
}));

jest.mock("../../utils/returnPolicyResolver", () => ({
  normalizeProductReturnPolicyFields: jest.fn(() => ({
    valid: true,
    returnPolicyMode: "inherit",
    returnAllowed: true,
    returnWindowDays: 7,
    returnConditions: "",
  })),
  assertSellerReturnPolicyReady: jest.fn(() => ({ valid: true })),
}));

jest.mock("../../utils/productPublishGuard", () => {
  const actual = jest.requireActual("../../utils/productPublishGuard");
  return {
    ...actual,
    assertPublishable: jest.fn().mockResolvedValue(undefined),
    enforcePublishSlugOnTransition: jest.fn().mockResolvedValue("aaurikaa-foundation-ring"),
  };
});

jest.mock("../../utils/productImportExport", () => ({
  runBulkImport: jest.fn().mockResolvedValue({
    count: 1,
    batchId: "batch-1",
    summary: {},
    upsert: false,
  }),
}));

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Product = require("../../models/Product");
const Seller = require("../../models/Seller");
require("../../models/WeightClass");
const {
  addProduct,
  updateProduct,
  autoSaveProduct,
} = require("../../controllers/adminProductController");
const { addProduct: sellerAddProduct } = require("../../controllers/sellerProductController");
const { bulkUploadAdmin } = require("../../controllers/bulkProductImportController");
const { runBulkImport } = require("../../utils/productImportExport");
const { INTERNAL_SELLER_USERNAME } = require("../../config/aaurikaaFoundation");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

async function createOtherSeller() {
  return Seller.create({
    username: `other-seller-${Date.now()}`,
    email: `other-seller-${Date.now()}@example.com`,
  });
}

async function internalSellerId() {
  const internal = await Seller.findOne({ username: INTERNAL_SELLER_USERNAME });
  expect(internal).toBeTruthy();
  return internal._id.toString();
}

describe("AAURIKAA admin product seller enforcement", () => {
  let mongoServer;
  let adminId;

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
    await Promise.all([Product.deleteMany({}), Seller.deleteMany({})]);
    adminId = new mongoose.Types.ObjectId();
    runBulkImport.mockClear();
  });

  it("Admin creates product without sellerId → internal Seller", async () => {
    const req = {
      body: {
        name: "AAURIKAA Foundation Ring",
        sku: "AAU-FOUNDATION-SKU-1",
        regularPrice: 2500,
        status: "draft",
      },
      user: { _id: adminId },
      files: {},
    };
    const res = mockRes();

    await addProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const product = res.json.mock.calls[0][0].product;
    const internalId = await internalSellerId();
    expect(product.seller.toString()).toBe(internalId);
    expect(product.sellerShop.toString()).toBe(internalId);
    expect(product.seller.toString()).not.toBe(adminId.toString());
  });

  it("Admin creates product with a different sellerId → cannot assign that Seller", async () => {
    const other = await createOtherSeller();
    const req = {
      body: {
        name: "AAURIKAA Forced Owner Ring",
        sku: "AAU-FOUNDATION-SKU-2",
        regularPrice: 2500,
        status: "draft",
        sellerId: other._id.toString(),
        sellerShop: other._id.toString(),
      },
      user: { _id: adminId },
      files: {},
    };
    const res = mockRes();

    await addProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const product = res.json.mock.calls[0][0].product;
    const internalId = await internalSellerId();
    expect(product.seller.toString()).toBe(internalId);
    expect(product.seller.toString()).not.toBe(other._id.toString());
  });

  it("Admin updates product with a different sellerId → cannot change ownership", async () => {
    const other = await createOtherSeller();
    const created = await Product.create({
      name: "Existing Ring",
      slug: "existing-ring-abc12",
      sku: "AAU-UPDATE-SKU-1",
      regularPrice: 1000,
      status: "draft",
      ownerUserId: adminId,
    });

    const req = {
      params: { id: String(created._id) },
      body: {
        name: "Existing Ring",
        sku: "AAU-UPDATE-SKU-1",
        regularPrice: 1000,
        status: "draft",
        sellerId: other._id.toString(),
        sellerShop: other._id.toString(),
      },
      user: { _id: adminId },
      files: {},
    };
    const res = mockRes();

    await updateProduct(req, res);

    const persisted = await Product.findById(created._id);
    const internalId = await internalSellerId();
    expect(persisted.seller.toString()).toBe(internalId);
    expect(persisted.seller.toString()).not.toBe(other._id.toString());
    expect(persisted.ownerUserId.toString()).toBe(adminId.toString());
  });

  it("Admin autosave with a different sellerId → cannot change ownership", async () => {
    const other = await createOtherSeller();
    const draft = await Product.create({
      name: "Draft Ring",
      slug: "draft-ring-abc12",
      sku: "AAU-AUTOSAVE-SKU-1",
      regularPrice: 800,
      status: "draft",
      ownerUserId: adminId,
      seller: other._id,
    });

    const req = {
      body: {
        id: String(draft._id),
        name: "Draft Ring",
        sku: "AAU-AUTOSAVE-SKU-1",
        seller: other._id.toString(),
        sellerShop: other._id.toString(),
      },
      user: { _id: adminId },
    };
    const res = mockRes();

    await autoSaveProduct(req, res);

    const persisted = await Product.findById(draft._id);
    const internalId = await internalSellerId();
    expect(persisted.seller.toString()).toBe(internalId);
    expect(persisted.seller.toString()).not.toBe(other._id.toString());
  });

  it("Bulk import with sellerId → internal Seller remains authoritative", async () => {
    const other = await createOtherSeller();
    const req = {
      user: { _id: adminId },
      file: { originalname: "products.csv", buffer: Buffer.from("name,sku\nRing,SKU1") },
      body: { sellerId: other._id.toString() },
      query: {},
    };
    const res = mockRes();

    await bulkUploadAdmin(req, res);

    expect(runBulkImport).toHaveBeenCalledTimes(1);
    const importArgs = runBulkImport.mock.calls[0][0];
    const internalId = await internalSellerId();
    expect(String(importArgs.sellerId)).toBe(internalId);
    expect(String(importArgs.sellerId)).not.toBe(other._id.toString());
    expect(String(importArgs.uploaderId)).toBe(adminId.toString());
  });

  it("Admin JSON import pins seller to internal Seller (ignores JSON seller)", async () => {
    const other = await createOtherSeller();
    const { importProductsJsonAdmin } = require("../../controllers/productBackupController");
    const req = {
      user: { _id: adminId },
      body: {
        metadata: { version: "1.0", mode: "json-backup" },
        products: [
          {
            name: "JSON Restore Ring",
            sku: "AAU-JSON-RESTORE-1",
            regularPrice: 1200,
            status: "draft",
            seller: other._id.toString(),
            ownerUserId: other._id.toString(),
          },
        ],
      },
    };
    const res = mockRes();

    await importProductsJsonAdmin(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const persisted = await Product.findOne({ sku: "AAU-JSON-RESTORE-1" });
    const internalId = await internalSellerId();
    expect(persisted).toBeTruthy();
    expect(persisted.seller.toString()).toBe(internalId);
    expect(persisted.seller.toString()).not.toBe(other._id.toString());
    expect(persisted.ownerUserId.toString()).toBe(internalId);
  });

  it("Seller-portal product create still binds seller to the logged-in seller", async () => {
    const portalSellerId = new mongoose.Types.ObjectId();
    const other = await createOtherSeller();
    const req = {
      body: {
        name: "Seller Portal Ring",
        sku: "SELLER-PORTAL-SKU-1",
        regularPrice: 900,
        status: "draft",
        sellerId: other._id.toString(),
      },
      user: { _id: portalSellerId },
      files: {},
    };
    const res = mockRes();

    await sellerAddProduct(req, res);

    const persisted = await Product.findOne({ sku: "SELLER-PORTAL-SKU-1" });
    expect(persisted).toBeTruthy();
    expect(persisted.seller.toString()).toBe(portalSellerId.toString());
    expect(persisted.seller.toString()).not.toBe(other._id.toString());
  });
});
