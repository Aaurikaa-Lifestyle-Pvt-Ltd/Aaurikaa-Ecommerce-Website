/**
 * Scope J Phase 1 — Admin & Seller product listing pagination (backend only).
 */

const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = require("../helpers/testApp");
const Product = require("../../models/Product");
const Seller = require("../../models/Seller");
const Admin = require("../../models/Admin");

const JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const sign = (user, role) =>
  jwt.sign({ id: user._id, role }, JWT_SECRET, { expiresIn: "7d" });

const createAdmin = async () => {
  const t = Date.now() + Math.floor(Math.random() * 1e6);
  // Plaintext: Admin model validates password strength then hashes in pre-save.
  return Admin.create({
    name: "List Admin",
    username: `listadmin${t}`,
    email: `listadmin${t}@test.com`,
    password: "TestPassword123!",
    role: "admin",
    isSuperAdmin: true,
  });
};

const createSeller = async () => {
  const t = Date.now() + Math.floor(Math.random() * 1e6);
  return Seller.create({
    firstName: "List",
    lastName: "Seller",
    username: `listseller${t}`,
    email: `listseller${t}@test.com`,
    password: await bcrypt.hash("Test123!@#", 10),
    shopName: `List Shop ${t}`,
    shopUrl: `list-shop-${t}`,
    role: "seller",
    isApproved: true,
  });
};

const createProduct = async (overrides = {}) => {
  const seller = overrides.seller || (await createSeller());
  const sku = overrides.sku || `LST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return Product.create({
    name: "List Product",
    sku,
    seller: seller._id,
    ownerUserId: seller._id,
    regularPrice: 100,
    stock: 10,
    status: "published",
    approvalStatus: "approved",
    ...overrides,
  });
};

describe("Product listing pagination (Scope J Phase 1)", () => {
  beforeEach(async () => {
    await Product.deleteMany({});
    await Seller.deleteMany({});
    await Admin.deleteMany({});
  });

  describe("GET /api/admin/products", () => {
    it("returns legacy array when page and limit are omitted", async () => {
      const admin = await createAdmin();
      await createProduct({ name: "Galaxy Phone" });

      const res = await request(app)
        .get("/api/admin/products")
        .set("Authorization", `Bearer ${sign(admin, "admin")}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
    });

    it("returns paginated payload when limit is supplied", async () => {
      const admin = await createAdmin();
      await createProduct({ name: "Published One", status: "published" });
      await createProduct({
        name: "Draft One",
        status: "draft",
        approvalStatus: undefined,
        seller: null,
      });
      await createProduct({ name: "Trashed", status: "trash" });

      const res = await request(app)
        .get("/api/admin/products?limit=1&page=1")
        .set("Authorization", `Bearer ${sign(admin, "admin")}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(false);
      expect(res.body.products).toHaveLength(1);
      expect(res.body.pagination).toMatchObject({
        page: 1,
        limit: 1,
        total: 3,
        pages: 3,
      });
      expect(res.body.tabCounts).toMatchObject({
        all: 2,
        published: 1,
        draft: 1,
        trash: 1,
      });
    });

    it("matches Scope J name examples via token-prefix search (Gal)", async () => {
      const admin = await createAdmin();
      await createProduct({ name: "Galaxy S25", sku: "GAL-1" });
      await createProduct({ name: "Samsung Galaxy S25", sku: "GAL-2" });
      await createProduct({ name: "Premium Galaxy Charger", sku: "GAL-3" });
      await createProduct({ name: "SuperGalaxy One", sku: "GAL-4" });

      const res = await request(app)
        .get("/api/admin/products?limit=10&search=Gal")
        .set("Authorization", `Bearer ${sign(admin, "admin")}`);

      expect(res.status).toBe(200);
      const names = res.body.products.map((p) => p.name).sort();
      expect(names).toEqual([
        "Galaxy S25",
        "Premium Galaxy Charger",
        "Samsung Galaxy S25",
      ]);
    });

    it("rejects mid-token contains matches for name search", async () => {
      const admin = await createAdmin();
      await createProduct({ name: "Mega Flagship", sku: "FLG-1" });

      const res = await request(app)
        .get("/api/admin/products?limit=10&search=lag")
        .set("Authorization", `Bearer ${sign(admin, "admin")}`);

      expect(res.body.products).toHaveLength(0);
    });

    it("keeps tabCounts stable when list filters change", async () => {
      const admin = await createAdmin();
      await createProduct({ name: "Alpha Published", status: "published" });
      await createProduct({ name: "Beta Draft", status: "draft", seller: null });

      const res = await request(app)
        .get("/api/admin/products?limit=10&search=Beta")
        .set("Authorization", `Bearer ${sign(admin, "admin")}`);

      expect(res.body.products).toHaveLength(1);
      expect(res.body.tabCounts).toMatchObject({
        all: 2,
        published: 1,
        draft: 1,
        trash: 0,
      });
    });

    it("excludes seller autosaved drafts from listing", async () => {
      const admin = await createAdmin();
      const seller = await createSeller();
      await createProduct({
        name: "Autosave Draft",
        status: "draft",
        seller: seller._id,
        ownerUserId: seller._id,
      });
      await Product.updateOne(
        { name: "Autosave Draft" },
        { $unset: { approvalStatus: "" } }
      );
      await createProduct({
        name: "Visible Draft",
        status: "draft",
        seller: null,
      });

      const res = await request(app)
        .get("/api/admin/products?limit=20")
        .set("Authorization", `Bearer ${sign(admin, "admin")}`);

      const names = res.body.products.map((p) => p.name);
      expect(names).toContain("Visible Draft");
      expect(names).not.toContain("Autosave Draft");
      expect(res.body.tabCounts.draft).toBe(1);
    });

    it("includes admin-created drafts with pinned seller in list and draft count", async () => {
      const admin = await createAdmin();
      const internalSeller = await createSeller();
      await createProduct({
        name: "Admin Autosave Draft",
        status: "draft",
        seller: internalSeller._id,
        ownerUserId: admin._id,
      });
      await Product.updateOne(
        { name: "Admin Autosave Draft" },
        { $unset: { approvalStatus: "" } }
      );

      const allRes = await request(app)
        .get("/api/admin/products?limit=20")
        .set("Authorization", `Bearer ${sign(admin, "admin")}`);

      const draftRes = await request(app)
        .get("/api/admin/products?limit=20&tab=draft")
        .set("Authorization", `Bearer ${sign(admin, "admin")}`);

      expect(allRes.body.products.map((p) => p.name)).toContain("Admin Autosave Draft");
      expect(allRes.body.tabCounts.draft).toBe(1);
      expect(draftRes.body.products.map((p) => p.name)).toContain("Admin Autosave Draft");
      expect(draftRes.body.pagination.total).toBe(1);
      expect(draftRes.body.tabCounts.draft).toBe(1);
    });

    it("keeps trash tab visibility unchanged", async () => {
      const admin = await createAdmin();
      const internalSeller = await createSeller();
      await createProduct({
        name: "Trashed Admin",
        status: "trash",
        seller: internalSeller._id,
        ownerUserId: admin._id,
      });
      await createProduct({
        name: "Live Admin",
        status: "published",
        seller: internalSeller._id,
        ownerUserId: admin._id,
      });

      const trashRes = await request(app)
        .get("/api/admin/products?limit=20&tab=trash")
        .set("Authorization", `Bearer ${sign(admin, "admin")}`);

      expect(trashRes.body.products.map((p) => p.name)).toEqual(["Trashed Admin"]);
      expect(trashRes.body.tabCounts).toMatchObject({
        all: 1,
        published: 1,
        draft: 0,
        trash: 1,
      });
    });
  });

  describe("GET /api/seller/products/my", () => {
    it("returns legacy wrapped products without pagination params", async () => {
      const seller = await createSeller();
      await createProduct({ seller: seller._id, ownerUserId: seller._id });

      const res = await request(app)
        .get("/api/seller/products/my")
        .set("Authorization", `Bearer ${sign(seller, "seller")}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.products).toHaveLength(1);
      expect(res.body.data.pagination).toBeUndefined();
    });

    it("returns paginated seller products scoped to owner", async () => {
      const seller = await createSeller();
      const other = await createSeller();
      await createProduct({
        name: "Mine",
        seller: seller._id,
        ownerUserId: seller._id,
        status: "published",
      });
      await createProduct({
        name: "Not Mine",
        seller: other._id,
        ownerUserId: other._id,
        status: "published",
      });

      const res = await request(app)
        .get("/api/seller/products/my?limit=10")
        .set("Authorization", `Bearer ${sign(seller, "seller")}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products).toHaveLength(1);
      expect(res.body.data.products[0].name).toBe("Mine");
      expect(res.body.data.pagination.total).toBe(1);
      expect(res.body.data.tabCounts.published).toBe(1);
    });

    it("matches SKU by exact value", async () => {
      const seller = await createSeller();
      await createProduct({
        seller: seller._id,
        ownerUserId: seller._id,
        sku: "EXACT-SKU-99",
        name: "Exact SKU Product",
      });
      await createProduct({
        seller: seller._id,
        ownerUserId: seller._id,
        sku: "OTHER-SKU",
        name: "Other",
      });

      const res = await request(app)
        .get("/api/seller/products/my?limit=10&sku=EXACT-SKU-99")
        .set("Authorization", `Bearer ${sign(seller, "seller")}`);

      expect(res.body.data.products).toHaveLength(1);
      expect(res.body.data.products[0].sku).toBe("EXACT-SKU-99");
    });
  });
});
