/**
 * Global search service tests (Phase 2).
 * Covers entity resolution, productSearchQueryBuilder, and filter merge.
 * Ranking / sortBy=relevance is out of scope for Phase 2.
 */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { MongoMemoryServer } = require("mongodb-memory-server");

const Product = require("../../models/Product");
const Category = require("../../models/Category");
const Subcategory = require("../../models/Subcategory");
const ChildCategory = require("../../models/ChildCategory");
const Brand = require("../../models/brand");
const Seller = require("../../models/Seller");

const {
  escapeRegex,
  normalizeSearchTerm,
  isSuggestionTermValid,
  buildContainsRegex,
} = require("../../services/search/searchUtils");
const {
  resolveMatchingEntities,
  resolveMatchingTags,
} = require("../../services/search/searchEntityResolver");
const {
  buildDirectFieldMatches,
  buildEntityIdMatches,
  buildSearchOrClause,
  buildSearchFilterClause,
  appendSearchFilter,
} = require("../../services/search/productSearchQueryBuilder");
const {
  buildPublishedProductFilter,
  buildProductSort,
  resolvePagination,
  mergeStorefrontProductFilters,
  buildInStockListingClause,
  applyTaxonomyScope,
  searchProducts,
  getCataloguePriceBounds,
  getProductSuggestions,
  getGroupedSuggestions,
} = require("../../services/search/globalSearchService");

describe("searchUtils", () => {
  it("escapes regex metacharacters", () => {
    expect(escapeRegex("a+b*c?")).toBe("a\\+b\\*c\\?");
    expect(escapeRegex("(test)[x].")).toBe("\\(test\\)\\[x\\]\\.");
  });

  it("normalizes and escapes search terms", () => {
    expect(normalizeSearchTerm(null)).toBeNull();
    expect(normalizeSearchTerm("   ")).toBeNull();
    const result = normalizeSearchTerm("  Sam$ung  ");
    expect(result.trimmed).toBe("Sam$ung");
    expect(result.escaped).toBe("Sam\\$ung");
  });

  it("validates suggestion term minimum length", () => {
    expect(isSuggestionTermValid("a")).toBe(false);
    expect(isSuggestionTermValid("ab")).toBe(true);
    expect(isSuggestionTermValid("  x  ")).toBe(false);
  });

  it("builds case-insensitive contains regex fragment", () => {
    expect(buildContainsRegex("phone")).toEqual({ $regex: "phone", $options: "i" });
  });
});

describe("productSearchQueryBuilder", () => {
  const brandId = new mongoose.Types.ObjectId();
  const categoryId = new mongoose.Types.ObjectId();
  const sellerId = new mongoose.Types.ObjectId();

  it("builds direct field matches for name, descriptions, and sku", () => {
    const clauses = buildDirectFieldMatches("laptop");
    expect(clauses).toHaveLength(4);
    expect(clauses.map((c) => Object.keys(c)[0])).toEqual([
      "name",
      "shortDesc",
      "longDesc",
      "sku",
    ]);
  });

  it("builds entity ID matches including seller/sellerShop", () => {
    const clauses = buildEntityIdMatches({
      categoryIds: [categoryId],
      brandIds: [brandId],
      sellerIds: [sellerId],
      subcategoryIds: [],
      childCategoryIds: [],
    });
    expect(clauses).toEqual(
      expect.arrayContaining([
        { category: { $in: [categoryId] } },
        { brand: { $in: [brandId] } },
        {
          $or: [
            { seller: { $in: [sellerId] } },
            { sellerShop: { $in: [sellerId] } },
          ],
        },
      ])
    );
  });

  it("always includes a tags regex clause in the search $or", () => {
    const orClause = buildSearchOrClause("wireless", {});
    expect(orClause.some((c) => c.tags)).toBe(true);
  });

  it("appends search $or onto filter via $and (AND with existing filters)", () => {
    const filter = { status: "published", brand: brandId };
    appendSearchFilter(filter, "phone", { brandIds: [brandId] });
    expect(filter.status).toBe("published");
    expect(filter.brand).toEqual(brandId);
    expect(filter.$and).toHaveLength(1);
    expect(filter.$and[0].$or.length).toBeGreaterThan(0);
  });

  it("returns null clause when or list would be empty only if empty input — tags always present", () => {
    expect(buildSearchFilterClause("x", {})).toEqual({
      $or: expect.any(Array),
    });
  });
});

describe("globalSearchService helpers", () => {
  it("builds published product filter", () => {
    expect(buildPublishedProductFilter()).toEqual({
      status: "published",
      approvalStatus: "approved",
    });
  });

  it("maps existing sortBy values (no relevance)", () => {
    expect(buildProductSort("newest")).toEqual({ createdAt: -1 });
    expect(buildProductSort("price-low")).toEqual({ salePrice: 1, regularPrice: 1 });
    expect(buildProductSort("price-high")).toEqual({ salePrice: -1, regularPrice: -1 });
    expect(buildProductSort("rating")).toEqual({ avgRating: -1 });
    expect(buildProductSort("name")).toEqual({ name: 1 });
    expect(buildProductSort("sales")).toEqual({ salesCount: -1, createdAt: -1 });
    expect(buildProductSort(undefined)).toEqual({ createdAt: -1 });
  });

  it("resolves pagination with storefront defaults", () => {
    expect(resolvePagination({})).toEqual({ page: 1, limit: 24, skip: 0 });
    expect(resolvePagination({ page: "2", limit: "10" })).toEqual({
      page: 2,
      limit: 10,
      skip: 10,
    });
    expect(resolvePagination({ featured: "true" }).limit).toBe(10);
  });

  it("merges non-q filters with AND semantics", () => {
    const filter = buildPublishedProductFilter();
    mergeStorefrontProductFilters(filter, {
      brand: String(brandIdSafe()),
      category: String(categoryIdSafe()),
      subcategory: String(subcategoryIdSafe()),
      childCategory: String(childCategoryIdSafe()),
      tag: "organic",
      featured: "true",
      rating: "4",
      inStock: "true",
      minPrice: "100",
      maxPrice: "500",
    });
    expect(filter.isFeatured).toBe(true);
    expect(filter.tags).toEqual({ $regex: "organic", $options: "i" });
    expect(filter.brand).toBe(String(brandIdSafe()));
    expect(filter.category).toBe(String(categoryIdSafe()));
    expect(filter.subcategory).toBe(String(subcategoryIdSafe()));
    expect(filter.childCategory).toBe(String(childCategoryIdSafe()));
    expect(filter.avgRating).toEqual({ $gte: 4 });
    expect(filter.$and.length).toBeGreaterThanOrEqual(3);
  });

  it("ignores invalid ObjectIds for subcategory and childCategory", () => {
    const filter = buildPublishedProductFilter();
    mergeStorefrontProductFilters(filter, {
      subcategory: "not-an-id",
      childCategory: "also-bad",
    });
    expect(filter.subcategory).toBeUndefined();
    expect(filter.childCategory).toBeUndefined();
  });

  it("treats parent stock or any variantStock quantity as in-stock", () => {
    const clause = buildInStockListingClause();
    expect(clause.$or).toEqual(
      expect.arrayContaining([{ stock: { $gt: 0 } }])
    );

    const filter = buildPublishedProductFilter();
    mergeStorefrontProductFilters(filter, { inStock: "true" });
    expect(filter.$and).toContainEqual(clause);
    expect(JSON.stringify(filter)).not.toContain('"$gt":["$stock",0]');
  });

  it("applies merchandising label collections onto the existing listing filter", () => {
    const saleFilter = buildPublishedProductFilter();
    mergeStorefrontProductFilters(saleFilter, { label: "sale" });
    expect(saleFilter.$and.some((clause) => clause.$expr)).toBe(true);

    const dealFilter = buildPublishedProductFilter();
    mergeStorefrontProductFilters(dealFilter, { label: "deal" });
    expect(dealFilter["bulkDiscount.enabled"]).toBe(true);
    expect(dealFilter.$and).toBeUndefined();

    const featuredByLabel = buildPublishedProductFilter();
    mergeStorefrontProductFilters(featuredByLabel, { label: "featured" });
    expect(featuredByLabel.isFeatured).toBe(true);
    expect(featuredByLabel.$and).toBeUndefined();

    const newFilter = buildPublishedProductFilter();
    mergeStorefrontProductFilters(newFilter, { label: "new" });
    expect(newFilter.createdAt).toEqual({ $gte: expect.any(Date) });
    expect(newFilter.$and).toBeUndefined();

    const newInStock = buildPublishedProductFilter();
    mergeStorefrontProductFilters(newInStock, { label: "new", inStock: "true" });
    expect(newInStock.createdAt).toEqual({ $gte: expect.any(Date) });
    expect(Array.isArray(newInStock.$and) && newInStock.$and.length).toBeGreaterThan(0);
  });

  it("applies taxonomy scope preferring child > sub > category", () => {
    const child = new mongoose.Types.ObjectId();
    const sub = new mongoose.Types.ObjectId();
    const cat = new mongoose.Types.ObjectId();
    const filter = {};
    applyTaxonomyScope(filter, { category: cat, subcategory: sub, childCategory: child });
    expect(filter).toEqual({ childCategory: child });
  });

  it("taxonomy scope clears conflicting query taxonomy ObjectIds", () => {
    const cat = new mongoose.Types.ObjectId();
    const filter = {
      category: new mongoose.Types.ObjectId(),
      subcategory: new mongoose.Types.ObjectId(),
      childCategory: new mongoose.Types.ObjectId(),
    };
    applyTaxonomyScope(filter, { category: cat });
    expect(filter).toEqual({ category: cat });
  });
});

function brandIdSafe() {
  return "507f1f77bcf86cd799439011";
}
function categoryIdSafe() {
  return "507f1f77bcf86cd799439012";
}
function subcategoryIdSafe() {
  return "507f1f77bcf86cd799439013";
}
function childCategoryIdSafe() {
  return "507f1f77bcf86cd799439014";
}

describe("globalSearchService integration (entity-aware q)", () => {
  let mongoServer;
  let category;
  let subcategory;
  let childCategory;
  let brand;
  let seller;
  let otherBrand;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Subcategory.deleteMany({});
    await ChildCategory.deleteMany({});
    await Brand.deleteMany({});
    await Seller.deleteMany({});

    category = await Category.create({ name: "Electronics", isActive: true });
    subcategory = await Subcategory.create({
      name: "Mobile Phones",
      category: category._id,
    });
    childCategory = await ChildCategory.create({
      name: "Android Devices",
      subcategory: subcategory._id,
    });
    brand = await Brand.create({ name: "Samsung", isActive: true });
    otherBrand = await Brand.create({ name: "Dell", isActive: true });
    const sellerToken = `gss-${Date.now()}`;
    seller = await Seller.create({
      firstName: "Ananya",
      lastName: "Bazaar",
      username: sellerToken,
      shopName: "Anbazar Gadgets",
      shopUrl: `shop-${sellerToken}`,
      email: `${sellerToken}@test.com`,
      password: await bcrypt.hash("Test123!@#", 10),
      isApproved: true,
    });

    await Product.create([
      {
        name: "Office Chair",
        sku: "gss-chair-1",
        regularPrice: 2000,
        status: "published",
        approvalStatus: "approved",
        brand: otherBrand._id,
        tags: ["furniture"],
      },
      {
        name: "Wireless Earbuds",
        sku: "gss-ear-1",
        regularPrice: 1500,
        status: "published",
        approvalStatus: "approved",
        brand: brand._id,
        category: category._id,
        seller: seller._id,
        tags: ["audio", "wireless"],
      },
      {
        name: "Galaxy Case",
        sku: "gss-case-1",
        regularPrice: 500,
        shortDesc: "Protective shell",
        status: "published",
        approvalStatus: "approved",
        brand: otherBrand._id,
        category: category._id,
        subcategory: subcategory._id,
        childCategory: childCategory._id,
        tags: ["accessory"],
      },
      {
        name: "Draft Only",
        sku: "gss-draft-1",
        regularPrice: 100,
        status: "draft",
        brand: brand._id,
      },
    ]);
  });

  it("resolves matching entities by name in parallel", async () => {
    const resolved = await resolveMatchingEntities(escapeRegex("Sam"));
    expect(resolved.brands.map((b) => b.name)).toContain("Samsung");
    expect(resolved.brandIds).toHaveLength(1);

    const byCategory = await resolveMatchingEntities(escapeRegex("Electron"));
    expect(byCategory.categories[0].name).toBe("Electronics");

    const bySub = await resolveMatchingEntities(escapeRegex("Mobile"));
    expect(bySub.subcategories[0].name).toBe("Mobile Phones");

    const byChild = await resolveMatchingEntities(escapeRegex("Android"));
    expect(byChild.childCategories[0].name).toBe("Android Devices");

    const bySeller = await resolveMatchingEntities(escapeRegex("Anbazar"));
    expect(bySeller.sellers[0].shopName).toBe("Anbazar Gadgets");
  });

  it("resolves tags from published products only", async () => {
    const tags = await resolveMatchingTags(escapeRegex("wire"));
    expect(tags).toContain("wireless");
    expect(tags).not.toContain("furniture");
  });

  it("searchProducts matches via brand entity when product name does not contain q", async () => {
    const result = await searchProducts({ q: "Samsung" });
    const names = result.products.map((p) => p.name);
    expect(names).toContain("Wireless Earbuds");
    expect(names).not.toContain("Office Chair");
    expect(names).not.toContain("Draft Only");
  });

  it("searchProducts matches via category entity", async () => {
    const result = await searchProducts({ q: "Electronics" });
    const names = result.products.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["Wireless Earbuds", "Galaxy Case"]));
    expect(names).not.toContain("Office Chair");
  });

  it("searchProducts matches via tag string in q", async () => {
    const result = await searchProducts({ q: "furniture" });
    expect(result.products.map((p) => p.name)).toEqual(["Office Chair"]);
  });

  it("searchProducts matches via seller shop name", async () => {
    const result = await searchProducts({ q: "Gadgets" });
    expect(result.products.map((p) => p.name)).toContain("Wireless Earbuds");
  });

  it("AND-narrows q results when explicit brand filter is present", async () => {
    const withoutBrand = await searchProducts({ q: "Electronics" });
    expect(withoutBrand.products.length).toBeGreaterThanOrEqual(2);

    const withBrand = await searchProducts({
      q: "Electronics",
      brand: String(brand._id),
    });
    expect(withBrand.products.map((p) => p.name)).toEqual(["Wireless Earbuds"]);
  });

  it("getProductSuggestions returns flat product array", async () => {
    const products = await getProductSuggestions("Samsung", { limit: 10 });
    expect(Array.isArray(products)).toBe(true);
    expect(products[0]).toEqual(
      expect.objectContaining({ _id: expect.anything(), name: expect.any(String), slug: expect.any(String) })
    );
  });

  it("getGroupedSuggestions returns grouped sections and null for short terms", async () => {
    expect(await getGroupedSuggestions("a")).toBeNull();

    const grouped = await getGroupedSuggestions("Sam");
    expect(grouped).toEqual(
      expect.objectContaining({
        products: expect.any(Array),
        categories: expect.any(Array),
        subcategories: expect.any(Array),
        childCategories: expect.any(Array),
        brands: expect.any(Array),
        sellers: expect.any(Array),
        tags: expect.any(Array),
      })
    );
    expect(grouped.brands.some((b) => b.name === "Samsung")).toBe(true);
    // AAURIKAA single-store: sellers key preserved but empty unless marketplace surfaces enabled
    expect(grouped.sellers).toEqual([]);
  });

  it("filters searchProducts by subcategory and childCategory ObjectIds", async () => {
    const bySub = await searchProducts({ subcategory: String(subcategory._id) });
    expect(bySub.products.map((p) => p.name)).toEqual(["Galaxy Case"]);

    const byChild = await searchProducts({ childCategory: String(childCategory._id) });
    expect(byChild.products.map((p) => p.name)).toEqual(["Galaxy Case"]);
  });

  it("taxonomyScope remains authoritative over conflicting category query filter", async () => {
    const otherCat = await Category.create({ name: "Furniture", isActive: true });
    const result = await searchProducts(
      { category: String(otherCat._id) },
      { taxonomyScope: { category: category._id } }
    );
    const names = result.products.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["Wireless Earbuds", "Galaxy Case"]));
    expect(names).not.toContain("Office Chair");
  });

  it("getCataloguePriceBounds returns min/max effective prices", async () => {
    const bounds = await getCataloguePriceBounds({});
    expect(bounds.minPrice).toBe(500);
    expect(bounds.maxPrice).toBe(2000);

    const scoped = await getCataloguePriceBounds(
      {},
      { taxonomyScope: { childCategory: childCategory._id } }
    );
    expect(scoped).toEqual({ minPrice: 500, maxPrice: 500 });

    const empty = await getCataloguePriceBounds({ brand: new mongoose.Types.ObjectId().toString() });
    expect(empty).toEqual({ minPrice: null, maxPrice: null });
  });

  it("getCataloguePriceBounds ignores minPrice/maxPrice query params", async () => {
    const bounds = await getCataloguePriceBounds({ minPrice: "1000", maxPrice: "1500" });
    expect(bounds.minPrice).toBe(500);
    expect(bounds.maxPrice).toBe(2000);
  });

  it("escapes regex special characters in q without throwing", async () => {
    const result = await searchProducts({ q: "Sam.+[" });
    expect(result.products).toEqual([]);
  });

  it("inStock listing includes variant-only stock and excludes fully out of stock", async () => {
    await Product.create([
      {
        name: "Parent Stock Ring",
        sku: "gss-stock-parent",
        regularPrice: 100,
        stock: 4,
        status: "published",
        approvalStatus: "approved",
      },
      {
        name: "Variant Stock Ring",
        sku: "gss-stock-variant",
        regularPrice: 100,
        stock: 0,
        variantStock: { "color:gold": 2, "color:silver": 0 },
        status: "published",
        approvalStatus: "approved",
      },
      {
        name: "Out Of Stock Ring",
        sku: "gss-stock-oos",
        regularPrice: 100,
        stock: 0,
        variantStock: { "color:gold": 0 },
        status: "published",
        approvalStatus: "approved",
      },
    ]);

    const result = await searchProducts({ inStock: "true" });
    const names = result.products.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(["Parent Stock Ring", "Variant Stock Ring"])
    );
    expect(names).not.toContain("Out Of Stock Ring");
    expect(names).not.toContain("Office Chair");
  });

  it("ignores salePrice 0 for onSale and price filters (treat as no sale)", async () => {
    await Product.create([
      {
        name: "Zero Sale Price Earrings",
        sku: "gss-zero-sale",
        regularPrice: 4290,
        salePrice: 0,
        status: "published",
        approvalStatus: "approved",
        category: category._id,
      },
      {
        name: "Real Sale Ring",
        sku: "gss-real-sale",
        regularPrice: 1690,
        salePrice: 1390,
        status: "published",
        approvalStatus: "approved",
        category: category._id,
      },
    ]);

    const onSale = await searchProducts({
      onSale: "true",
      category: String(category._id),
    });
    const onSaleNames = onSale.products.map((p) => p.name);
    expect(onSaleNames).toContain("Real Sale Ring");
    expect(onSaleNames).not.toContain("Zero Sale Price Earrings");

    const underMax = await searchProducts({
      maxPrice: "1680",
      category: String(category._id),
    });
    const underMaxNames = underMax.products.map((p) => p.name);
    expect(underMaxNames).toContain("Real Sale Ring");
    expect(underMaxNames).not.toContain("Zero Sale Price Earrings");

    const combined = await searchProducts({
      onSale: "true",
      maxPrice: "1680",
      category: String(category._id),
    });
    expect(combined.products.map((p) => p.name)).toEqual(
      expect.arrayContaining(["Real Sale Ring"])
    );
    expect(combined.products.map((p) => p.name)).not.toContain(
      "Zero Sale Price Earrings"
    );
  });

  describe("Price sorting regression", () => {
    let sortedCategory;

    beforeEach(async () => {
      sortedCategory = await Category.create({ name: "Sorted Category", isActive: true });
      await Product.create([
        {
          name: "Regular High Price Product",
          sku: "gss-sort-reg-high",
          regularPrice: 5000,
          status: "published",
          approvalStatus: "approved",
          category: sortedCategory._id,
        },
        {
          name: "Sale Product Low Price",
          sku: "gss-sort-sale-low",
          regularPrice: 1500,
          salePrice: 900,
          status: "published",
          approvalStatus: "approved",
          category: sortedCategory._id,
        },
        {
          name: "Regular Mid Price Product",
          sku: "gss-sort-reg-mid",
          regularPrice: 2000,
          status: "published",
          approvalStatus: "approved",
          category: sortedCategory._id,
        },
        {
          name: "Sale Product Mid Price",
          sku: "gss-sort-sale-mid",
          regularPrice: 2500,
          salePrice: 1800,
          status: "published",
          approvalStatus: "approved",
          category: sortedCategory._id,
        },
      ]);
    });

    afterEach(async () => {
      await Product.deleteMany({ category: sortedCategory._id });
      await Category.deleteOne({ _id: sortedCategory._id });
    });

    it("sorts price low to high correctly using effectivePrice", async () => {
      const result = await searchProducts({
        category: sortedCategory._id.toString(),
        sortBy: "price-low",
      });
      const names = result.products.map((p) => p.name);
      expect(names).toEqual([
        "Sale Product Low Price",       // Effective: 900
        "Sale Product Mid Price",       // Effective: 1800
        "Regular Mid Price Product",    // Effective: 2000
        "Regular High Price Product",   // Effective: 5000
      ]);
    });

    it("sorts price high to low correctly using effectivePrice", async () => {
      const result = await searchProducts({
        category: sortedCategory._id.toString(),
        sortBy: "price-high",
      });
      const names = result.products.map((p) => p.name);
      expect(names).toEqual([
        "Regular High Price Product",   // Effective: 5000
        "Regular Mid Price Product",    // Effective: 2000
        "Sale Product Mid Price",       // Effective: 1800
        "Sale Product Low Price",       // Effective: 900
      ]);
    });

    it("paginates products correctly when sorting by price", async () => {
      const page1 = await searchProducts({
        category: sortedCategory._id.toString(),
        sortBy: "price-low",
        page: 1,
        limit: 2,
      });
      expect(page1.products.map((p) => p.name)).toEqual([
        "Sale Product Low Price",
        "Sale Product Mid Price",
      ]);
      expect(page1.totalCount).toBe(4);
      expect(page1.totalPages).toBe(2);

      const page2 = await searchProducts({
        category: sortedCategory._id.toString(),
        sortBy: "price-low",
        page: 2,
        limit: 2,
      });
      expect(page2.products.map((p) => p.name)).toEqual([
        "Regular Mid Price Product",
        "Regular High Price Product",
      ]);
    });

    it("getCataloguePriceBounds correctly handles string ObjectIds (facet queries)", async () => {
      const bounds = await getCataloguePriceBounds({
        category: sortedCategory._id.toString(),
      });
      expect(bounds.minPrice).toBe(900);
      expect(bounds.maxPrice).toBe(5000);
    });
  });
});

