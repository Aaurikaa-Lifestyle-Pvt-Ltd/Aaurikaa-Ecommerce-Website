const {
  parsePaginationQuery,
  buildSort,
  buildHierarchyRows,
  normalizeId,
  isValidObjectId,
  MAX_LIMIT,
} = require("../../services/categoryHierarchyListingService");

describe("categoryHierarchyListingService", () => {
  const catA = { _id: "507f1f77bcf86cd799439001", name: "Electronics", slug: "electronics", taxRate: 18, commissionRate: 5, commissionType: "percentage", showInMegaMenu: true, megaMenuOrder: 1, image: "a.jpg", isActive: true };
  const catB = { _id: "507f1f77bcf86cd799439002", name: "Fashion", taxRate: 12, commissionRate: 3, commissionType: "percentage", showInMegaMenu: false, megaMenuOrder: 0, isActive: false };

  const sub1 = { _id: "507f1f77bcf86cd799439011", name: "Phones", slug: "phones", category: "507f1f77bcf86cd799439001", taxRate: 18 };
  const sub2 = { _id: "507f1f77bcf86cd799439012", name: "Laptops", category: "507f1f77bcf86cd799439001" };
  const sub3 = { _id: "507f1f77bcf86cd799439013", name: "Shirts", category: "507f1f77bcf86cd799439002" };

  const child1 = { _id: "507f1f77bcf86cd799439021", name: "Android", subcategory: "507f1f77bcf86cd799439011", taxRate: 18 };
  const child2 = { _id: "507f1f77bcf86cd799439022", name: "iOS", subcategory: "507f1f77bcf86cd799439011" };
  const child3 = { _id: "507f1f77bcf86cd799439023", name: "Gaming", subcategory: "507f1f77bcf86cd799439012" };

  describe("parsePaginationQuery", () => {
    it("applies defaults and caps limit", () => {
      expect(parsePaginationQuery({})).toEqual({ page: 1, limit: 10, skip: 0 });
      expect(parsePaginationQuery({ page: "2", limit: "5" })).toEqual({
        page: 2,
        limit: 5,
        skip: 5,
      });
      expect(parsePaginationQuery({ limit: "999" }).limit).toBe(MAX_LIMIT);
    });
  });

  describe("buildSort", () => {
    it("defaults to sortOrder asc with name tiebreaker", () => {
      expect(buildSort({})).toEqual({ sortOrder: 1, name: 1 });
    });

    it("supports name desc", () => {
      expect(buildSort({ sortBy: "name", sortOrder: "desc" })).toEqual({ name: -1 });
    });
  });

  describe("buildHierarchyRows", () => {
    it("emits one row per child with full group on same assembly", () => {
      const rows = buildHierarchyRows(
        [catA],
        [sub1],
        [child1, child2]
      );
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.category === "Electronics")).toBe(true);
      expect(rows.map((r) => r.child)).toEqual(["Android", "iOS"]);
      expect(rows.every((r) => r.catId === catA._id && r.subId === sub1._id)).toBe(true);
      expect(rows[0].categorySlug).toBe("electronics");
      expect(rows[0].subcategorySlug).toBe("phones");
      expect(rows[0].categoryTaxType).toBe("GST");
      expect(rows[0].categoryCommission).toBeUndefined();
      expect(rows[0].categoryFaq).toBeUndefined();
      expect(rows[0].showInMegaMenu).toBeUndefined();
      expect(rows.every((r) => r.isActive === true)).toBe(true);
    });

    it("includes isActive from the root category on every row", () => {
      const rows = buildHierarchyRows([catB], [], []);
      expect(rows).toHaveLength(1);
      expect(rows[0].isActive).toBe(false);
    });

    it("emits placeholder row when sub has no children", () => {
      const rows = buildHierarchyRows([catA], [sub2], []);
      expect(rows).toHaveLength(1);
      expect(rows[0].subcategory).toBe("Laptops");
      expect(rows[0].child).toBe("—");
    });

    it("emits category-only row when no subcategories", () => {
      const rows = buildHierarchyRows([catB], [], []);
      expect(rows).toHaveLength(1);
      expect(rows[0].subcategory).toBe("—");
      expect(rows[0].child).toBe("—");
    });

    it("filters by valid subcategoryId and keeps all children in one batch", () => {
      const rows = buildHierarchyRows(
        [catA],
        [sub1, sub2],
        [child1, child2, child3],
        { subcategoryId: sub1._id }
      );
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.child).sort()).toEqual(["Android", "iOS"]);
    });

    it("filters by childCategoryId to a single row", () => {
      const rows = buildHierarchyRows(
        [catA],
        [sub1],
        [child1, child2],
        { childCategoryId: child2._id }
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].child).toBe("iOS");
    });

    it("assembles multiple category groups independently", () => {
      const rows = buildHierarchyRows(
        [catA, catB],
        [sub1, sub3],
        [child1]
      );
      expect(rows.filter((r) => r.category === "Electronics")).toHaveLength(1);
      expect(rows.filter((r) => r.category === "Fashion")).toHaveLength(1);
    });
  });

  describe("normalizeId / isValidObjectId", () => {
    it("normalizes object refs", () => {
      expect(normalizeId({ _id: "abc" })).toBe("abc");
      expect(normalizeId("abc")).toBe("abc");
    });

    it("validates 24-char hex ObjectIds", () => {
      expect(isValidObjectId("507f1f77bcf86cd799439011")).toBe(true);
      expect(isValidObjectId("not-an-id")).toBe(false);
    });
  });
});
