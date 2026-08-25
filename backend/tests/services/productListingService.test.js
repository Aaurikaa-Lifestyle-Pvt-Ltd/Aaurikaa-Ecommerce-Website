const {
  isPaginatedMode,
  parsePaginationQuery,
  applySearchAndFilters,
  buildNameTokenPrefixPattern,
  buildAdminBaseFilter,
  buildSellerBaseFilter,
  MIN_NAME_SEARCH_LENGTH,
  MAX_LIMIT,
} = require("../../services/productListingService");

describe("productListingService", () => {
  describe("isPaginatedMode", () => {
    it("returns false when page and limit are absent", () => {
      expect(isPaginatedMode({})).toBe(false);
      expect(isPaginatedMode({ search: "ab" })).toBe(false);
    });

    it("returns true when page or limit is present", () => {
      expect(isPaginatedMode({ page: "1" })).toBe(true);
      expect(isPaginatedMode({ limit: "10" })).toBe(true);
    });
  });

  describe("parsePaginationQuery", () => {
    it("applies defaults and caps limit at 50", () => {
      expect(parsePaginationQuery({})).toEqual({ page: 1, limit: 20, skip: 0 });
      expect(parsePaginationQuery({ page: "2", limit: "5" })).toEqual({
        page: 2,
        limit: 5,
        skip: 5,
      });
      expect(parsePaginationQuery({ limit: "999" }).limit).toBe(MAX_LIMIT);
    });
  });

  describe("applySearchAndFilters", () => {
    it("skips name search below minimum length", () => {
      const filter = buildAdminBaseFilter();
      applySearchAndFilters(filter, { search: "g" }, { isAdmin: true });
      expect(filter.$and).toBeUndefined();
    });

    it("applies token-prefix name pattern at minimum length", () => {
      expect(buildNameTokenPrefixPattern("Gal")).toBe("(^|\\s+)Gal");
      const filter = buildAdminBaseFilter();
      applySearchAndFilters(filter, { search: "ga" }, { isAdmin: true });
      expect(filter.$and[0].name.$regex).toBe("(^|\\s+)ga");
      expect(filter.$and[0].name.$options).toBe("i");
    });

    it("does not use unrestricted contains patterns for name search", () => {
      const pattern = buildNameTokenPrefixPattern("Gal");
      expect(pattern).not.toMatch(/\.\*/);
      expect(pattern.startsWith("(^|\\s+)")).toBe(true);
    });

    it("applies SKU exact and prefix fallback", () => {
      const filter = buildAdminBaseFilter();
      applySearchAndFilters(filter, { sku: "ABC-1" }, { isAdmin: true });
      expect(filter.$and[0].$or).toEqual([
        { sku: "ABC-1" },
        { sku: { $regex: "^ABC-1", $options: "i" } },
      ]);
    });

    it("applies ObjectId brand filter and seller filter for admin", () => {
      const brandId = "507f1f77bcf86cd799439011";
      const sellerId = "507f1f77bcf86cd799439012";
      const filter = buildAdminBaseFilter();
      applySearchAndFilters(
        filter,
        { brand: brandId, seller: sellerId },
        { isAdmin: true }
      );
      expect(filter.brand.toString()).toBe(brandId);
      expect(filter.seller.toString()).toBe(sellerId);
    });

    it("scopes seller listing to Product.seller and ignores query.seller override", () => {
      const sellerId = "507f1f77bcf86cd799439012";
      const filter = buildSellerBaseFilter(sellerId);
      expect(filter).toEqual({ seller: sellerId });
      expect(filter.$or).toBeUndefined();

      applySearchAndFilters(
        filter,
        { seller: "507f1f77bcf86cd799439011" },
        { isAdmin: false }
      );
      // Query seller must not override commercial ownership scope
      expect(String(filter.seller)).toBe(sellerId);
    });

    it("buildSellerBaseFilter uses seller only (no ownerUserId OR)", () => {
      const sellerId = "507f1f77bcf86cd799439012";
      expect(buildSellerBaseFilter(sellerId)).toEqual({ seller: sellerId });
    });

    it("applies tab all as status not trash", () => {
      const filter = buildAdminBaseFilter();
      applySearchAndFilters(filter, { tab: "all" }, { isAdmin: true });
      expect(filter.status).toEqual({ $ne: "trash" });
    });
  });
});
