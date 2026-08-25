jest.mock("../../models/Order");

const Order = require("../../models/Order");
const {
  getSuccessfulOrderCount,
  isManualConfirmationEligible,
  getManualConfirmationStatus,
  listManualConfirmationQueue,
  updateManualConfirmationStatus,
  evaluateEligibility,
} = require("../../services/manualConfirmationService");

describe("manualConfirmationService", () => {
  const shopperId = "507f1f77bcf86cd799439099";
  const referenceDate = new Date("2026-05-27T14:00:00.000Z");
  const oldCreatedAt = new Date("2026-05-27T10:00:00.000Z");
  const recentCreatedAt = new Date("2026-05-27T13:30:00.000Z");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows immediate eligibility for first successful-order cohort", async () => {
    Order.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    const eligible = await isManualConfirmationEligible(
      {
        _id: "o1",
        buyer: shopperId,
        status: "paid",
        createdAt: recentCreatedAt,
      },
      shopperId,
      referenceDate
    );

    expect(eligible).toBe(true);
  });

  it("allows eligibility for older orders in first successful-order cohort", async () => {
    Order.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    Order.countDocuments.mockResolvedValue(0);

    const eligible = await isManualConfirmationEligible(
      {
        _id: "o1",
        buyer: shopperId,
        status: "paid",
        createdAt: oldCreatedAt,
      },
      shopperId,
      referenceDate
    );

    expect(eligible).toBe(true);
  });

  it("blocks the 4th order when 3 successful orders exist before it", async () => {
    const successTimestamps = [
      new Date("2026-01-01").getTime(),
      new Date("2026-02-01").getTime(),
      new Date("2026-03-01").getTime(),
    ];

    Order.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(
        successTimestamps.map((createdAt, index) => ({
          buyer: shopperId,
          createdAt: new Date(createdAt),
          _id: `success-${index}`,
        }))
      ),
    });

    const eligible = await isManualConfirmationEligible(
      {
        _id: "o4",
        buyer: shopperId,
        status: "paid",
        createdAt: new Date("2026-04-01"),
      },
      shopperId,
      new Date("2026-05-01")
    );

    expect(eligible).toBe(false);
    expect(
      evaluateEligibility(
        { _id: "o4", buyer: shopperId, status: "paid", createdAt: new Date("2026-04-01") },
        shopperId,
        successTimestamps,
        new Date("2026-05-01")
      )
    ).toBe(false);
  });

  it("excludes cancelled orders from eligibility", async () => {
    const eligible = evaluateEligibility(
      { buyer: shopperId, status: "cancelled", createdAt: oldCreatedAt },
      shopperId,
      [],
      referenceDate
    );
    expect(eligible).toBe(false);
  });

  it("excludes rejected confirmation orders from eligibility", async () => {
    const eligible = evaluateEligibility(
      {
        buyer: shopperId,
        status: "paid",
        createdAt: oldCreatedAt,
        manualConfirmationStatus: "REJECTED",
      },
      shopperId,
      [],
      referenceDate
    );
    expect(eligible).toBe(false);
  });

  it("returns CALL_PENDING when eligible and unset", () => {
    expect(getManualConfirmationStatus({ manualConfirmationStatus: null }, { eligible: true })).toEqual({
      status: "CALL_PENDING",
      eligible: true,
    });
  });

  it("counts only delivered/completed successful orders", async () => {
    Order.countDocuments.mockResolvedValue(2);

    const count = await getSuccessfulOrderCount(shopperId);
    expect(count).toBe(2);
    expect(Order.countDocuments).toHaveBeenCalledWith({
      buyer: shopperId,
      status: { $in: ["delivered", "completed"] },
    });
  });

  it("filters queue by confirmation status and paginates", async () => {
    const queueOrders = [
      {
        _id: "o1",
        buyer: shopperId,
        status: "paid",
        createdAt: oldCreatedAt,
        manualConfirmationStatus: null,
        totalAmount: 100,
      },
      {
        _id: "o2",
        buyer: shopperId,
        status: "delivered",
        createdAt: oldCreatedAt,
        manualConfirmationStatus: "CONFIRMED",
        totalAmount: 200,
      },
    ];

    Order.find
      .mockReturnValueOnce({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(queueOrders),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

    const result = await listManualConfirmationQueue({
      page: 1,
      limit: 10,
      status: "CONFIRMED",
      referenceDate,
    });

    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]._id).toBe("o2");
    expect(result.pagination.totalCount).toBe(1);
  });

  it("updates admin confirmation status with audit fields", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const order = {
      _id: "o1",
      buyer: shopperId,
      status: "paid",
      createdAt: oldCreatedAt,
      manualConfirmationStatus: null,
      save,
    };

    Order.findById.mockResolvedValue(order);
    Order.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    const result = await updateManualConfirmationStatus({
      orderId: "o1",
      adminId: "admin1",
      status: "CONFIRMED",
      notes: "  Verified by phone  ",
      referenceDate,
    });

    expect(result.manualConfirmation.status).toBe("CONFIRMED");
    expect(order.manualConfirmationStatus).toBe("CONFIRMED");
    expect(order.manualConfirmationNotes).toBe("Verified by phone");
    expect(order.manualConfirmationBy).toBe("admin1");
    expect(order.manualConfirmationAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalled();
  });
});
