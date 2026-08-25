const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const ShopperWalletLedger = require("../../models/ShopperWalletLedger");
const Shopper = require("../../models/Shopper");
const {
  creditRefundToWallet,
  getLatestBalance,
  getWalletSummary,
  listWalletTransactions,
  buildRefundIdempotencyKey,
} = require("../../services/shopperWalletService");

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
  await ShopperWalletLedger.deleteMany({});
  await Shopper.deleteMany({});
});

describe("shopperWalletService", () => {
  it("credits refund and maintains running balance", async () => {
    const shopper = await Shopper.create({
      firstName: "Wallet",
      lastName: "User",
      username: `wallet-${Date.now()}`,
      email: `wallet-${Date.now()}@test.com`,
      password: "password123",
      phone: "7777777777",
    });

    const returnRequestId = new mongoose.Types.ObjectId();
    const orderId = new mongoose.Types.ObjectId();

    const first = await creditRefundToWallet({
      shopperId: shopper._id,
      amount: 150.5,
      returnRequestId,
      orderId,
      orderLabel: "INV-100",
    });

    expect(first.credited).toBe(true);
    expect(first.balanceAfter).toBe(150.5);

    const balance = await getLatestBalance(shopper._id);
    expect(balance).toBe(150.5);

    const summary = await getWalletSummary(shopper._id);
    expect(summary.balance).toBe(150.5);
    expect(summary.currency).toBe("INR");
  });

  it("is idempotent per return request idempotency key", async () => {
    const shopper = await Shopper.create({
      firstName: "Idem",
      lastName: "User",
      username: `idem-${Date.now()}`,
      email: `idem-${Date.now()}@test.com`,
      password: "password123",
      phone: "6666666666",
    });

    const returnRequestId = new mongoose.Types.ObjectId();
    const orderId = new mongoose.Types.ObjectId();

    const first = await creditRefundToWallet({
      shopperId: shopper._id,
      amount: 99,
      returnRequestId,
      orderId,
      orderLabel: "INV-200",
    });
    const second = await creditRefundToWallet({
      shopperId: shopper._id,
      amount: 99,
      returnRequestId,
      orderId,
      orderLabel: "INV-200",
    });

    expect(first.credited).toBe(true);
    expect(second.skipped).toBe(true);
    expect(await getLatestBalance(shopper._id)).toBe(99);

    const key = buildRefundIdempotencyKey(returnRequestId);
    const entries = await ShopperWalletLedger.find({ idempotencyKey: key });
    expect(entries).toHaveLength(1);
  });

  it("lists transactions with pagination", async () => {
    const shopper = await Shopper.create({
      firstName: "List",
      lastName: "User",
      username: `list-${Date.now()}`,
      email: `list-${Date.now()}@test.com`,
      password: "password123",
      phone: "5555555555",
    });

    for (let i = 0; i < 3; i += 1) {
      await creditRefundToWallet({
        shopperId: shopper._id,
        amount: 10 + i,
        returnRequestId: new mongoose.Types.ObjectId(),
        orderId: new mongoose.Types.ObjectId(),
        orderLabel: `INV-${i}`,
      });
    }

    const result = await listWalletTransactions({
      shopperId: shopper._id,
      page: 1,
      limit: 2,
    });

    expect(result.transactions).toHaveLength(2);
    expect(result.pagination.totalCount).toBe(3);
    expect(result.pagination.totalPages).toBe(2);
  });
});
