const {
  ARCHIVE_RETENTION_MONTHS,
  getArchiveCutoffDate,
  isArchivedForShopper,
  getShopperArchiveFilter,
  buildShopperVisibleOrderFilter,
} = require("../../services/orderArchiveVisibilityService");

describe("orderArchiveVisibilityService", () => {
  const referenceDate = new Date("2026-05-27T12:00:00.000Z");
  const oldCreatedAt = new Date("2024-01-01T00:00:00.000Z");
  const recentCreatedAt = new Date("2026-01-01T00:00:00.000Z");

  it("uses a 13-month retention window", () => {
    expect(ARCHIVE_RETENTION_MONTHS).toBe(13);
    const cutoff = getArchiveCutoffDate(referenceDate);
    expect(cutoff.getFullYear()).toBe(2025);
    expect(cutoff.getMonth()).toBe(3);
  });

  describe("isArchivedForShopper", () => {
    it("archives delivered orders older than 13 months", () => {
      expect(
        isArchivedForShopper(
          { status: "delivered", createdAt: oldCreatedAt },
          referenceDate
        )
      ).toBe(true);
    });

    it("archives completed orders older than 13 months", () => {
      expect(
        isArchivedForShopper(
          { status: "completed", createdAt: oldCreatedAt },
          referenceDate
        )
      ).toBe(true);
    });

    it("archives cancelled orders older than 13 months", () => {
      expect(
        isArchivedForShopper(
          { status: "cancelled", createdAt: oldCreatedAt },
          referenceDate
        )
      ).toBe(true);
    });

    it("keeps recent delivered orders visible", () => {
      expect(
        isArchivedForShopper(
          { status: "delivered", createdAt: recentCreatedAt },
          referenceDate
        )
      ).toBe(false);
    });

    it("does not archive non-terminal statuses regardless of age", () => {
      expect(
        isArchivedForShopper(
          { status: "shipped", createdAt: oldCreatedAt },
          referenceDate
        )
      ).toBe(false);
      expect(
        isArchivedForShopper(
          { status: "pending", createdAt: oldCreatedAt },
          referenceDate
        )
      ).toBe(false);
    });
  });

  describe("getShopperArchiveFilter", () => {
    it("excludes archived terminal orders via MongoDB filter", () => {
      const filter = getShopperArchiveFilter(referenceDate);
      expect(filter).toEqual({
        $or: [
          { status: { $nin: ["delivered", "completed", "cancelled"] } },
          { createdAt: { $gt: getArchiveCutoffDate(referenceDate) } },
        ],
      });
    });
  });

  describe("buildShopperVisibleOrderFilter", () => {
    it("scopes archive visibility to shopper-owned listings", () => {
      const buyerId = "507f1f77bcf86cd799439099";
      expect(buildShopperVisibleOrderFilter(buyerId, referenceDate)).toEqual({
        buyer: buyerId,
        ...getShopperArchiveFilter(referenceDate),
      });
    });
  });
});
