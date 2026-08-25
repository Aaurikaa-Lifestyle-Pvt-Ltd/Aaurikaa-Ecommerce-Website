const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const ReturnRequest = require("../../models/ReturnRequest");
const Order = require("../../models/Order");
const Shopper = require("../../models/Shopper");
const Seller = require("../../models/Seller");
const Commission = require("../../models/Commission");
const ShopperWalletLedger = require("../../models/ShopperWalletLedger");
const SellerLedger = require("../../models/SellerLedger");
const {
  canAutomateAfterSalesRefund,
  runAfterSalesRefundOrchestration,
} = require("../../services/returnRefundOrchestrationService");

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
  await Order.deleteMany({});
  await Shopper.deleteMany({});
  await Seller.deleteMany({});
  await Commission.deleteMany({});
  await ShopperWalletLedger.deleteMany({});
  await SellerLedger.deleteMany({});
});

async function seedRefundCase({
  returnRequired = false,
  receiptConfirmedAt = null,
  status = "resolved",
} = {}) {
  const seller = await Seller.create({
    firstName: "Refund",
    lastName: "Seller",
    email: `refund-seller-${Date.now()}@test.com`,
    username: `refund-seller-${Date.now()}`,
    password: "password123",
    phone: "9999999991",
    shopName: "Refund Shop",
    shopUrl: `refund-shop-${Date.now()}`,
    bankAccount: {
      accountNumber: "1234567890",
      accountNumberConfirm: "1234567890",
      ifscCode: "SBIN0001234",
    },
  });

  const shopper = await Shopper.create({
    firstName: "Refund",
    lastName: "Buyer",
    username: `refund-buyer-${Date.now()}`,
    email: `refund-buyer-${Date.now()}@test.com`,
    password: "password123",
    phone: "8888888881",
  });

  const productId = new mongoose.Types.ObjectId();
  const order = await Order.create({
    buyer: shopper._id,
    items: [{ product: productId, quantity: 1, price: 500, originalPrice: 500 }],
    totalAmount: 500,
    shippingCharge: 0,
    status: "delivered",
    paymentMethod: "phonepe",
    paymentStatus: "success",
    invoiceNumber: "INV-REFUND-TEST",
    shippingDetails: {
      fullName: "Refund Buyer",
      email: shopper.email,
      phone: shopper.phone,
      address: "123 Test St",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
    },
  });

  await Commission.create({
    seller: seller._id,
    order: order._id,
    product: productId,
    orderAmount: 500,
    commissionRate: 10,
    commissionAmount: 50,
    commissionType: "percentage",
    appliedRule: "system_default",
    status: "approved",
    period: { year: 2026, month: 7 },
  });

  const returnRequest = await ReturnRequest.create({
    order: order._id,
    buyer: shopper._id,
    status,
    caseFlow: "after_sales",
    resolution: "refund",
    returnRequired,
    receiptConfirmedAt,
    reasonCode: "DEFECTIVE_DAMAGED",
  });

  return { seller, shopper, order, returnRequest };
}

describe("returnRefundOrchestrationService", () => {
  it("canAutomateAfterSalesRefund requires receipt when return required", () => {
    expect(
      canAutomateAfterSalesRefund({
        caseFlow: "after_sales",
        resolution: "refund",
        returnRequired: true,
        receiptConfirmedAt: null,
      })
    ).toBe(false);

    expect(
      canAutomateAfterSalesRefund({
        caseFlow: "after_sales",
        resolution: "refund",
        returnRequired: true,
        receiptConfirmedAt: new Date(),
      })
    ).toBe(true);

    expect(
      canAutomateAfterSalesRefund({
        caseFlow: "after_sales",
        resolution: "refund",
        returnRequired: false,
      })
    ).toBe(true);
  });

  it("credits wallet and reverses commission for no-return refund resolution", async () => {
    const { shopper, order, returnRequest } = await seedRefundCase({
      returnRequired: false,
    });

    const result = await runAfterSalesRefundOrchestration(returnRequest._id);

    expect(result.processed).toBe(true);
    expect(result.amount).toBe(500);

    const refreshed = await ReturnRequest.findById(returnRequest._id).lean();
    expect(refreshed.refundCompletedAt).toBeTruthy();
    expect(refreshed.walletCreditProcessedAt).toBeTruthy();
    expect(refreshed.walletCreditAmount).toBe(500);
    expect(refreshed.financialReversalProcessedAt).toBeTruthy();

    const walletEntries = await ShopperWalletLedger.find({ shopper: shopper._id });
    expect(walletEntries).toHaveLength(1);
    expect(walletEntries[0].amount).toBe(500);
    expect(walletEntries[0].balanceAfter).toBe(500);

    const commission = await Commission.findOne({ order: order._id });
    expect(commission.status).toBe("cancelled");
  });

  it("is idempotent on repeated orchestration", async () => {
    const { shopper, returnRequest } = await seedRefundCase({ returnRequired: false });

    const first = await runAfterSalesRefundOrchestration(returnRequest._id);
    const second = await runAfterSalesRefundOrchestration(returnRequest._id);

    expect(first.processed).toBe(true);
    expect(second.skipped).toBe(true);
    expect(second.alreadyProcessed).toBe(true);

    const walletEntries = await ShopperWalletLedger.find({ shopper: shopper._id });
    expect(walletEntries).toHaveLength(1);
  });
});
