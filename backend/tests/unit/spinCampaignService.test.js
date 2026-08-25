const mongoose = require("mongoose");
const SpinCampaign = require("../../models/SpinCampaign");
const SpinAttempt = require("../../models/SpinAttempt");
const Coupon = require("../../models/coupon");
const {
  ELIGIBILITY,
  pickWeightedSegment,
  getCampaignWindowState,
  parseCampaignCalendarDate,
  validateCampaignPayload,
} = require("../../services/spinCampaignService");

describe("spinCampaignService", () => {
  describe("pickWeightedSegment", () => {
    it("selects segment by weight using injected rng", () => {
      const segments = [
        { _id: "a", label: "Win", type: "coupon", weight: 10 },
        { _id: "b", label: "Lose", type: "lose", weight: 90 },
      ];

      const winner = pickWeightedSegment(segments, () => 0.05);
      expect(String(winner._id)).toBe("a");

      const loser = pickWeightedSegment(segments, () => 0.95);
      expect(String(loser._id)).toBe("b");
    });
  });

  describe("getCampaignWindowState", () => {
    it("returns inactive for draft campaigns", () => {
      expect(
        getCampaignWindowState({
          status: "draft",
          startDate: null,
          endDate: null,
        })
      ).toBe(ELIGIBILITY.CAMPAIGN_INACTIVE);
    });

    it("returns expired when endDate is in the past", () => {
      expect(
        getCampaignWindowState({
          status: "active",
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        })
      ).toBe(ELIGIBILITY.CAMPAIGN_EXPIRED);
    });

    it("treats Admin UTC-midnight date-only windows as inclusive IST calendar days", () => {
      // Admin saved start=2026-08-26 / end=2026-08-27 via <input type="date">.
      const campaign = {
        status: "active",
        startDate: new Date("2026-08-26T00:00:00.000Z"),
        endDate: new Date("2026-08-27T00:00:00.000Z"),
      };

      // 26 Aug 2026 01:00 IST == 25 Aug 2026 19:30 UTC (before UTC midnight start).
      expect(
        getCampaignWindowState(campaign, new Date("2026-08-25T19:30:00.000Z"))
      ).toBe(ELIGIBILITY.ELIGIBLE);

      // Still before IST start of 26 Aug (25 Aug 18:29 UTC).
      expect(
        getCampaignWindowState(campaign, new Date("2026-08-25T18:29:59.000Z"))
      ).toBe(ELIGIBILITY.CAMPAIGN_NOT_STARTED);

      // Inclusive through end of 27 Aug IST.
      expect(
        getCampaignWindowState(campaign, new Date("2026-08-27T18:29:59.999Z"))
      ).toBe(ELIGIBILITY.ELIGIBLE);
      expect(
        getCampaignWindowState(campaign, new Date("2026-08-27T18:30:00.000Z"))
      ).toBe(ELIGIBILITY.CAMPAIGN_EXPIRED);
    });
  });

  describe("parseCampaignCalendarDate", () => {
    it("maps YYYY-MM-DD to IST start and end of day", () => {
      expect(parseCampaignCalendarDate("2026-08-26", "start").toISOString()).toBe(
        "2026-08-25T18:30:00.000Z"
      );
      expect(parseCampaignCalendarDate("2026-08-27", "end").toISOString()).toBe(
        "2026-08-27T18:29:59.999Z"
      );
    });
  });

  describe("validateCampaignPayload", () => {
    it("requires positive total weight and valid coupon template", () => {
      const errors = validateCampaignPayload({
        name: "Test",
        slug: "test",
        segments: [
          {
            label: "10% off",
            type: "coupon",
            weight: 0,
            couponTemplate: {
              discountType: "percentage",
              discountValue: 10,
              minOrder: 0,
              validityDays: 7,
            },
          },
        ],
      });

      expect(errors.some((error) => error.includes("Total segment weight"))).toBe(true);
    });
  });
});

describe("SpinCampaign model indexes", () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || "mongodb://localhost:27017/ecommerce_test_db");
    }
  });

  afterEach(async () => {
    await SpinAttempt.deleteMany({});
    await SpinCampaign.deleteMany({});
    await Coupon.deleteMany({ code: /^SPINUNIT-/ });
  });

  it("enforces one attempt per shopper per campaign", async () => {
    const campaign = await SpinCampaign.create({
      name: "Unit Campaign",
      slug: `unit-${Date.now()}`,
      status: "active",
      segments: [{ label: "Lose", type: "lose", weight: 100 }],
    });

    const shopperId = new mongoose.Types.ObjectId();

    await SpinAttempt.create({
      campaignId: campaign._id,
      shopperId,
      segmentId: campaign.segments[0]._id,
      outcome: "lose",
    });

    await expect(
      SpinAttempt.create({
        campaignId: campaign._id,
        shopperId,
        segmentId: campaign.segments[0]._id,
        outcome: "lose",
      })
    ).rejects.toMatchObject({ code: 11000 });
  });
});
