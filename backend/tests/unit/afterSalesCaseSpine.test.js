const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const ReturnRequest = require("../../models/ReturnRequest");
const {
  appendResolutionChange,
  inferResolutionFromLegacyStatus,
  getEffectiveResolution,
  mapStatusToQueueBucket,
  isLegacyCaseFlow,
  assertResolutionHistoryAppendOnly,
  snapshotResolutionHistory,
} = require("../../utils/afterSalesCaseSpine");

describe("afterSalesCaseSpine (Phase 0)", () => {
  describe("legacy dual-read mapping", () => {
    it("infers resolution from legacy refund statuses", () => {
      expect(inferResolutionFromLegacyStatus("refund_pending")).toBe("refund");
      expect(inferResolutionFromLegacyStatus("refund_approved")).toBe("refund");
      expect(inferResolutionFromLegacyStatus("refund_completed")).toBe("refund");
      expect(inferResolutionFromLegacyStatus("rejected")).toBe("rejected");
      expect(inferResolutionFromLegacyStatus("refund_rejected")).toBe("rejected");
      expect(inferResolutionFromLegacyStatus("pending_review")).toBeNull();
      expect(inferResolutionFromLegacyStatus("approved")).toBeNull();
    });

    it("prefers stored resolution over inferred legacy value", () => {
      expect(
        getEffectiveResolution({
          caseFlow: "legacy",
          status: "refund_completed",
          resolution: "replacement",
        })
      ).toBe("replacement");
      expect(
        getEffectiveResolution({
          caseFlow: "legacy",
          status: "refund_completed",
          resolution: null,
        })
      ).toBe("refund");
    });

    it("maps statuses to seller queue buckets", () => {
      expect(mapStatusToQueueBucket("pending_review")).toBe("pending_review");
      expect(mapStatusToQueueBucket("awaiting_pickup")).toBe("awaiting_pickup");
      expect(mapStatusToQueueBucket("in_transit")).toBe("in_transit");
      expect(mapStatusToQueueBucket("awaiting_inspection")).toBe("awaiting_inspection");
      expect(mapStatusToQueueBucket("resolved")).toBe("resolved");
      expect(mapStatusToQueueBucket("closed")).toBe("closed");
      expect(mapStatusToQueueBucket("refund_completed")).toBe("resolved");
      expect(mapStatusToQueueBucket("approved")).toBe("pending_review");
    });

    it("treats missing caseFlow as legacy", () => {
      expect(isLegacyCaseFlow(undefined)).toBe(true);
      expect(isLegacyCaseFlow("legacy")).toBe(true);
      expect(isLegacyCaseFlow("after_sales")).toBe(false);
    });
  });

  describe("resolution history append helper", () => {
    it("appends resolution changes and rejects invalid values", () => {
      const doc = { resolution: null, resolutionHistory: [] };
      expect(
        appendResolutionChange(doc, {
          toResolution: "refund",
          changedByRole: "seller",
          note: "approved refund",
        })
      ).toBe(true);
      expect(doc.resolution).toBe("refund");
      expect(doc.resolutionHistory).toHaveLength(1);
      expect(doc.resolutionHistory[0].fromResolution).toBeNull();
      expect(doc.resolutionHistory[0].toResolution).toBe("refund");

      expect(
        appendResolutionChange(doc, {
          toResolution: "refund",
          changedByRole: "admin",
        })
      ).toBe(false);

      expect(() =>
        appendResolutionChange(doc, { toResolution: "partial", changedByRole: "admin" })
      ).toThrow(/Invalid resolution/);
    });

    it("asserts append-only history snapshots", () => {
      const history = [
        {
          fromResolution: null,
          toResolution: "refund",
          changedAt: new Date("2026-01-01T00:00:00.000Z"),
          changedBy: null,
          changedByRole: "seller",
          note: null,
        },
      ];
      const snapshot = snapshotResolutionHistory(history);
      expect(() => assertResolutionHistoryAppendOnly(snapshot, history)).not.toThrow();
      expect(() => assertResolutionHistoryAppendOnly(snapshot, [])).toThrow(/append-only/);
      expect(() =>
        assertResolutionHistoryAppendOnly(snapshot, [
          { ...history[0], toResolution: "repair" },
        ])
      ).toThrow(/immutable/);
    });
  });

  describe("ReturnRequest model dual-path persistence", () => {
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
      await mongoServer.stop();
    });

    beforeEach(async () => {
      await ReturnRequest.deleteMany({});
    });

    it("defaults new documents to legacy caseFlow with null resolution", async () => {
      const created = await ReturnRequest.create({
        order: new mongoose.Types.ObjectId(),
        buyer: new mongoose.Types.ObjectId(),
        reasonCode: "DEFECTIVE_DAMAGED",
        status: "pending_review",
      });

      expect(created.caseFlow).toBe("legacy");
      expect(created.resolution).toBeNull();
      expect(created.returnRequired).toBeNull();
      expect(created.resolutionHistory).toEqual([]);
    });

    it("allows legacy admin refund transitions on save", async () => {
      const doc = await ReturnRequest.create({
        order: new mongoose.Types.ObjectId(),
        buyer: new mongoose.Types.ObjectId(),
        reasonCode: "WRONG_ITEM",
        status: "pending_review",
        caseFlow: "legacy",
      });

      doc.status = "approved";
      await doc.save();
      expect(doc.status).toBe("approved");

      doc.status = "refund_approved";
      await doc.save();
      expect(doc.status).toBe("refund_approved");

      doc.status = "refund_completed";
      await doc.save();
      expect(doc.status).toBe("refund_completed");
    });

    it("allows after-sales lifecycle transitions on save", async () => {
      const doc = await ReturnRequest.create({
        order: new mongoose.Types.ObjectId(),
        buyer: new mongoose.Types.ObjectId(),
        reasonCode: "NOT_AS_DESCRIBED",
        status: "pending_review",
        caseFlow: "after_sales",
        returnRequired: true,
      });

      doc.status = "awaiting_pickup";
      await doc.save();
      doc.status = "in_transit";
      await doc.save();
      doc.status = "awaiting_inspection";
      await doc.save();

      appendResolutionChange(doc, {
        toResolution: "refund",
        changedByRole: "seller",
        note: "item confirmed",
      });
      doc.status = "resolved";
      await doc.save();

      const reloaded = await ReturnRequest.findById(doc._id);
      expect(reloaded.status).toBe("resolved");
      expect(reloaded.resolution).toBe("refund");
      expect(reloaded.resolutionHistory).toHaveLength(1);
    });

    it("rejects mutation of prior resolutionHistory entries", async () => {
      const doc = await ReturnRequest.create({
        order: new mongoose.Types.ObjectId(),
        buyer: new mongoose.Types.ObjectId(),
        reasonCode: "OTHER",
        reasonText: "test",
        status: "awaiting_inspection",
        caseFlow: "after_sales",
      });

      appendResolutionChange(doc, {
        toResolution: "repair",
        changedByRole: "seller",
      });
      await doc.save();

      const reloaded = await ReturnRequest.findById(doc._id);
      reloaded.resolutionHistory[0].toResolution = "refund";
      reloaded.markModified("resolutionHistory");

      await expect(reloaded.save()).rejects.toThrow(/immutable|append-only/);
    });

    it("blocks new active request when after-sales case is open", async () => {
      const orderId = new mongoose.Types.ObjectId();
      await ReturnRequest.create({
        order: orderId,
        buyer: new mongoose.Types.ObjectId(),
        reasonCode: "DEFECTIVE_DAMAGED",
        status: "awaiting_pickup",
        caseFlow: "after_sales",
      });

      await expect(
        ReturnRequest.create({
          order: orderId,
          buyer: new mongoose.Types.ObjectId(),
          reasonCode: "WRONG_ITEM",
          status: "pending_review",
        })
      ).rejects.toMatchObject({ code: 11000 });
    });
  });
});
