/**
 * Stage 9 merchandising: collections, occasions, looks, curated UGC.
 * No default jewellery taxonomy. Product refs may be empty until catalogue load.
 */
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const request = require("supertest");

jest.mock("../../middleware/verifyAdmin", () => (req, res, next) => {
  req.user = { _id: "admin-test-id", role: "admin" };
  next();
});
jest.mock("../../middleware/loadAdminContext", () => (req, res, next) => {
  req.adminContext = { role: "super_admin" };
  next();
});
jest.mock("../../middleware/requirePermission", () => {
  const passthrough = () => (req, res, next) => next();
  const mock = passthrough;
  mock.requirePermission = passthrough;
  mock.requireAnyPermission = passthrough;
  return mock;
});

const Product = require("../../models/Product");
const MerchCollection = require("../../models/MerchCollection");
const Occasion = require("../../models/Occasion");
const ShopLook = require("../../models/ShopLook");
const StyledByYou = require("../../models/StyledByYou");
const {
  parseRefList,
  isHttpUrl,
  validateDisplayOrder,
  resolveProductRefs,
} = require("../../utils/merchandising");

const app = require("../helpers/testApp");

async function createProduct(overrides = {}) {
  return Product.create({
    name: "Merch Test Product",
    sku: `MERCH-SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    slug: `merch-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    regularPrice: 100,
    status: "published",
    approvalStatus: "approved",
    ...overrides,
  });
}

describe("merchandising utils", () => {
  it("parses mixed product ref lists without inventing ids", () => {
    expect(parseRefList(" a, b  c ")).toEqual(["a", "b", "c"]);
    expect(parseRefList(["x", "y,z"])).toEqual(["x", "y", "z"]);
    expect(parseRefList("")).toEqual([]);
  });

  it("accepts only http(s) external links", () => {
    expect(isHttpUrl("https://example.com/look")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("")).toBe(true);
  });

  it("rejects negative displayOrder", () => {
    expect(validateDisplayOrder(-1).valid).toBe(false);
    expect(validateDisplayOrder(2).value).toBe(2);
  });
});

describe("Stage 9 merchandising APIs", () => {
  let mongoServer;

  beforeAll(async () => {
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
      MerchCollection.deleteMany({}),
      Occasion.deleteMany({}),
      ShopLook.deleteMany({}),
      StyledByYou.deleteMany({}),
      Product.deleteMany({}),
    ]);
  });

  it("does not seed collections, occasions, looks, or UGC", async () => {
    const [collections, occasions, looks, ugc] = await Promise.all([
      request(app).get("/api/merchandising/collections"),
      request(app).get("/api/merchandising/occasions"),
      request(app).get("/api/merchandising/looks"),
      request(app).get("/api/merchandising/ugc"),
    ]);
    expect(collections.body.data.items).toEqual([]);
    expect(occasions.body.data.items).toEqual([]);
    expect(looks.body.data.items).toEqual([]);
    expect(ugc.body.data.items).toEqual([]);
    const serialized = JSON.stringify([
      collections.body,
      occasions.body,
      looks.body,
      ugc.body,
    ]);
    expect(serialized).not.toMatch(/Wedding|Festive|Party|Everyday|Golden Hour/i);
  });

  it("hides inactive collections and returns associated published products in order", async () => {
    const first = await createProduct({ name: "First", sku: "SKU-FIRST", slug: "first-prod" });
    const second = await createProduct({ name: "Second", sku: "SKU-SECOND", slug: "second-prod" });
    const draft = await createProduct({
      name: "Draft",
      sku: "SKU-DRAFT",
      slug: "draft-prod",
      status: "draft",
      approvalStatus: undefined,
    });

    await request(app)
      .post("/api/admin/merchandising/collections")
      .send({
        name: "Studio Edit",
        description: "Operator-authored landing copy",
        imageUrl: "https://cdn.example.com/edit.jpg",
        seoTitle: "Studio Edit",
        seoDescription: "Curated pieces",
        isActive: true,
        showOnHome: true,
        displayOrder: 1,
        productIds: `${second._id},${first.sku},${draft._id}`,
      })
      .expect(201);

    await request(app)
      .post("/api/admin/merchandising/collections")
      .send({ name: "Hidden Edit", isActive: false })
      .expect(201);

    const list = await request(app).get("/api/merchandising/collections?home=true");
    expect(list.body.data.items.map((item) => item.name)).toEqual(["Studio Edit"]);

    const detail = await request(app).get("/api/merchandising/collections/studio-edit");
    expect(detail.status).toBe(200);
    expect(detail.body.data.products.map((p) => p.sku)).toEqual(["SKU-SECOND", "SKU-FIRST"]);
    expect(detail.body.data.item.seoTitle).toBe("Studio Edit");
  });

  it("rejects unknown product associations", async () => {
    const res = await request(app)
      .post("/api/admin/merchandising/occasions")
      .send({ name: "Operator Occasion", productIds: "missing-sku" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Unknown product sku/);
  });

  it("creates looks with mobile imagery and CTA, then lists only visible looks", async () => {
    const product = await createProduct({ sku: "LOOK-SKU", slug: "look-prod" });
    const created = await request(app)
      .post("/api/admin/merchandising/looks")
      .send({
        title: "Evening Layering",
        description: "Supporting look copy",
        imageUrl: "https://cdn.example.com/look.jpg",
        mobileImageUrl: "https://cdn.example.com/look-mobile.jpg",
        ctaLabel: "Shop this look",
        ctaHref: "/looks/evening-layering",
        productIds: String(product._id),
        isActive: true,
        displayOrder: 0,
      });
    expect(created.status).toBe(201);
    expect(created.body.data.item.mobileImageUrl).toContain("look-mobile");

    await request(app)
      .post("/api/admin/merchandising/looks")
      .send({ title: "Unpublished Look", isActive: false })
      .expect(201);

    const publicList = await request(app).get("/api/merchandising/looks");
    expect(publicList.body.data.items).toHaveLength(1);
    expect(publicList.body.data.items[0].title).toBe("Evening Layering");
  });

  it("manages curated UGC without social-feed fields and supports deletion", async () => {
    const created = await request(app)
      .post("/api/admin/merchandising/ugc")
      .send({
        mediaType: "image",
        imageUrl: "https://cdn.example.com/ugc.jpg",
        creatorName: "A. Customer",
        caption: "Worn to a dinner",
        externalUrl: "https://example.com/post",
        isActive: true,
        displayOrder: 3,
      });
    expect(created.status).toBe(201);
    const id = created.body.data.item._id;
    expect(created.body.data.item).not.toHaveProperty("instagramId");
    expect(created.body.data.item).not.toHaveProperty("feedId");

    const listed = await request(app).get("/api/merchandising/ugc");
    expect(listed.body.data.items).toHaveLength(1);

    await request(app).delete(`/api/admin/merchandising/ugc/${id}`).expect(200);
    const after = await request(app).get("/api/merchandising/ugc");
    expect(after.body.data.items).toHaveLength(0);
  });

  it("resolves empty product refs without requiring a catalogue", async () => {
    const resolved = await resolveProductRefs("", Product);
    expect(resolved).toEqual({ ok: true, productIds: [] });
  });
});
