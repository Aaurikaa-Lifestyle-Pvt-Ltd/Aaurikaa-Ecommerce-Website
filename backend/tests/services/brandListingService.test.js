const {
  isPaginatedMode,
  parsePaginationQuery,
  buildListFilter,
  buildSort,
  resolveIncludeInactive,
  MAX_LIMIT,
} = require("../../services/brandListingService");

describe("brandListingService", () => {
  describe("isPaginatedMode", () => {
    it("returns false when page and limit are absent", () => {
      expect(isPaginatedMode({})).toBe(false);
      expect(isPaginatedMode({ includeInactive: "1" })).toBe(false);
    });

    it("returns true when page or limit is present", () => {
      expect(isPaginatedMode({ page: "1" })).toBe(true);
      expect(isPaginatedMode({ limit: "10" })).toBe(true);
    });
  });

  describe("parsePaginationQuery", () => {
    it("applies defaults and caps limit at 50", () => {
      expect(parsePaginationQuery({})).toEqual({ page: 1, limit: 20, skip: 0 });
      expect(parsePaginationQuery({ page: "3", limit: "10" })).toEqual({
        page: 3,
        limit: 10,
        skip: 20,
      });
      expect(parsePaginationQuery({ limit: "999" }).limit).toBe(MAX_LIMIT);
    });
  });

  describe("buildListFilter", () => {
    it("filters active-only by default", () => {
      expect(buildListFilter({})).toEqual({ isActive: true });
    });

    it("includes inactive when includeInactive is set", () => {
      expect(buildListFilter({ includeInactive: "1" })).toEqual({});
    });

    it("applies name prefix search", () => {
      const filter = buildListFilter({ includeInactive: "1", search: "Sam" });
      expect(filter.name.$regex).toBe("^Sam");
      expect(filter.name.$options).toBe("i");
    });

    it("applies explicit active status filter", () => {
      expect(buildListFilter({ includeInactive: "1", status: "inactive" })).toEqual({
        isActive: false,
      });
    });
  });

  describe("buildSort", () => {
    it("defaults to createdAt desc", () => {
      expect(buildSort({})).toEqual({ createdAt: -1 });
    });

    it("supports name asc", () => {
      expect(buildSort({ sortBy: "name", sortOrder: "asc" })).toEqual({ name: 1 });
    });
  });

  describe("resolveIncludeInactive", () => {
    it("recognizes truthy includeInactive values", () => {
      expect(resolveIncludeInactive({ includeInactive: "1" })).toBe(true);
      expect(resolveIncludeInactive({ includeInactive: true })).toBe(true);
      expect(resolveIncludeInactive({})).toBe(false);
    });
  });
});
