const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const Commission = require("../../models/Commission");
const Payout = require("../../models/Payout");
const SellerLedger = require("../../models/SellerLedger");
const ReturnRequest = require("../../models/ReturnRequest");
const Order = require("../../models/Order");
const Seller = require("../../models/Seller");
const Shopper = require("../../models/Shopper");
const {
  processRefundFinancialReversal,
  calcSellerNet,
} = require("../../services/returnRefundFinancialService");
const { validateSellerLedgerIntegrity } = require("../../utils/financialIntegrityValidator");

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
  await Commission.deleteMany({});
  await Payout.deleteMany({});
  await SellerLedger.deleteMany({});
  await ReturnRequest.deleteMany({});
  await Order.deleteMany({});
  await Seller.deleteMany({});
  await Shopper.deleteMany({});
});

async function seedBase({
  commissionStatus = "approved",
  withPayout = false,
  payoutStatus = "pending",
  paymentMethod = "phonepe",
  paymentStatus = "success",
} = {}) {
  const seller = await Seller.create({
    firstName: "Fin",
    lastName: "Seller",
    email: `seller-${Date.now()}@test.com`,
    username: `seller-${Date.now()}`,
    password: "password123",
    phone: "9999999999",
    shopName: "Fin Shop",
    shopUrl: `fin-shop-${Date.now()}`,
    bankAccount: {
      accountNumber: "1234567890",
      accountNumberConfirm: "1234567890",
      ifscCode: "SBIN0001234",
    },
  });

  const shopper = await Shopper.create({
    firstName: "Buyer",
    lastName: "Test",
    username: `buyer-${Date.now()}`,
    email: `buyer-${Date.now()}@test.com`,
    password: "password123",
    phone: "8888888888",
  });

  const productId = new mongoose.Types.ObjectId();

  const order = await Order.create({
    buyer: shopper._id,
    items: [
      {
        product: productId,
        quantity: 1,
        price: 1000,
        originalPrice: 1000,
      },
    ],
    totalAmount: 1000,
    shippingCharge: 0,
    status: "delivered",
    paymentStatus,
    paymentMethod,
    invoiceNumber: "INV-1001",
  });

  const returnRequest = await ReturnRequest.create({
    order: order._id,
    buyer: shopper._id,
    status: "refund_approved",
    reasonCode: "DEFECTIVE_DAMAGED",
  });

  const commission = await Commission.create({
    order: order._id,
    seller: seller._id,
    product: productId,
    orderAmount: 1000,
    commissionRate: 10,
    commissionAmount: 100,
    commissionType: "percentage",
    appliedRule: "system_default",
    status: commissionStatus,
    period: { year: 2026, month: 7 },
  });

  const sellerNet = calcSellerNet(commission);
  await SellerLedger.create({
    seller: seller._id,
    type: "commission_earned",
    amount: sellerNet,
    balanceAfter: sellerNet,
    reference: { model: "Commission", id: commission._id },
    description: "Initial commission earned",
  });

  let payout = null;
  if (withPayout) {
    payout = await Payout.create({
      seller: seller._id,
      amount: sellerNet,
      status: payoutStatus,
      paymentMethod: { type: "bank_transfer", details: {} },
      commissions: [commission._id],
    });

    await Commission.updateOne(
      { _id: commission._id },
      { $set: { status: "locked", lockedBy: payout._id } }
    );
    commission.status = "locked";
    commission.lockedBy = payout._id;

    await SellerLedger.create({
      seller: seller._id,
      type: "payout_requested",
      amount: -sellerNet,
      balanceAfter: 0,
      reference: { model: "Payout", id: payout._id },
      description: "Payout requested",
      createdAt: new Date(Date.now() + 1),
    });
  }

  return { seller, order, returnRequest, commission, payout, sellerNet };
}

async function seedMultiSeller() {
  const sellerA = await Seller.create({
    firstName: "Seller",
    lastName: "A",
    email: `seller-a-${Date.now()}@test.com`,
    username: `seller-a-${Date.now()}`,
    password: "password123",
    phone: "9111111111",
    shopName: "Shop A",
    shopUrl: `shop-a-${Date.now()}`,
    bankAccount: {
      accountNumber: "1234567890",
      accountNumberConfirm: "1234567890",
      ifscCode: "SBIN0001234",
    },
  });

  const sellerB = await Seller.create({
    firstName: "Seller",
    lastName: "B",
    email: `seller-b-${Date.now()}@test.com`,
    username: `seller-b-${Date.now()}`,
    password: "password123",
    phone: "9222222222",
    shopName: "Shop B",
    shopUrl: `shop-b-${Date.now()}`,
    bankAccount: {
      accountNumber: "0987654321",
      accountNumberConfirm: "0987654321",
      ifscCode: "SBIN0001234",
    },
  });

  const shopper = await Shopper.create({
    firstName: "Buyer",
    lastName: "Multi",
    username: `buyer-multi-${Date.now()}`,
    email: `buyer-multi-${Date.now()}@test.com`,
    password: "password123",
    phone: "8777777777",
  });

  const productA = new mongoose.Types.ObjectId();
  const productB = new mongoose.Types.ObjectId();

  const order = await Order.create({
    buyer: shopper._id,
    items: [
      { product: productA, quantity: 1, price: 800, originalPrice: 800 },
      { product: productB, quantity: 1, price: 1200, originalPrice: 1200 },
    ],
    totalAmount: 2000,
    shippingCharge: 0,
    status: "delivered",
    paymentStatus: "success",
    paymentMethod: "phonepe",
    invoiceNumber: "INV-MULTI-1",
  });

  const returnRequest = await ReturnRequest.create({
    order: order._id,
    buyer: shopper._id,
    status: "refund_approved",
    reasonCode: "WRONG_ITEM",
  });

  const commissionA = await Commission.create({
    order: order._id,
    seller: sellerA._id,
    product: productA,
    orderAmount: 800,
    commissionRate: 10,
    commissionAmount: 80,
    commissionType: "percentage",
    appliedRule: "system_default",
    status: "approved",
    period: { year: 2026, month: 7 },
  });

  const commissionB = await Commission.create({
    order: order._id,
    seller: sellerB._id,
    product: productB,
    orderAmount: 1200,
    commissionRate: 10,
    commissionAmount: 120,
    commissionType: "percentage",
    appliedRule: "system_default",
    status: "approved",
    period: { year: 2026, month: 7 },
  });

  const sellerNetA = calcSellerNet(commissionA);
  const sellerNetB = calcSellerNet(commissionB);

  await SellerLedger.create({
    seller: sellerA._id,
    type: "commission_earned",
    amount: sellerNetA,
    balanceAfter: sellerNetA,
    reference: { model: "Commission", id: commissionA._id },
    description: "Commission A earned",
  });

  await SellerLedger.create({
    seller: sellerB._id,
    type: "commission_earned",
    amount: sellerNetB,
    balanceAfter: sellerNetB,
    reference: { model: "Commission", id: commissionB._id },
    description: "Commission B earned",
  });

  return {
    order,
    returnRequest,
    sellerA,
    sellerB,
    commissionA,
    commissionB,
    sellerNetA,
    sellerNetB,
  };
}

describe("returnRefundFinancialService", () => {
  it("cancels approved commission and posts commission_reversed ledger debit (Scenario A)", async () => {
    const { order, returnRequest, commission, seller, sellerNet } = await seedBase();

    const result = await processRefundFinancialReversal({
      returnRequestId: returnRequest._id,
      orderId: order._id,
    });

    expect(result.summary.commissionsCancelled).toBe(1);
    expect(result.summary.ledgerReversalAmount).toBe(sellerNet);

    const updatedCommission = await Commission.findById(commission._id);
    expect(updatedCommission.status).toBe("cancelled");

    const reversal = await SellerLedger.findOne({
      seller: seller._id,
      type: "commission_reversed",
    });
    expect(reversal.amount).toBe(-sellerNet);
    expect(reversal.balanceAfter).toBe(0);

    await validateSellerLedgerIntegrity(seller._id);
  });

  it("auto-rejects pending payout, unlocks and cancels commission (Scenario B)", async () => {
    const { order, returnRequest, commission, payout, seller, sellerNet } = await seedBase({
      withPayout: true,
    });

    const result = await processRefundFinancialReversal({
      returnRequestId: returnRequest._id,
      orderId: order._id,
    });

    expect(result.summary.pendingPayoutsRejected).toBe(1);
    expect(result.summary.commissionsCancelled).toBe(1);

    const updatedPayout = await Payout.findById(payout._id);
    expect(updatedPayout.status).toBe("rejected");

    const updatedCommission = await Commission.findById(commission._id);
    expect(updatedCommission.status).toBe("cancelled");
    expect(updatedCommission.lockedBy).toBeNull();

    const latestLedger = await SellerLedger.findOne({ seller: seller._id }).sort({ createdAt: -1 });
    expect(latestLedger.balanceAfter).toBe(0);
  });

  it("unlocks approved payout, cancels commission, and flags payout for review (Scenario C)", async () => {
    const { order, returnRequest, commission, payout, seller, sellerNet } = await seedBase({
      withPayout: true,
      payoutStatus: "approved",
    });

    const result = await processRefundFinancialReversal({
      returnRequestId: returnRequest._id,
      orderId: order._id,
    });

    expect(result.summary.pendingPayoutsRejected).toBe(0);
    expect(result.summary.payoutsNeedingReview).toContain(String(payout._id));
    expect(result.summary.commissionsCancelled).toBe(1);
    expect(result.summary.ledgerReversalAmount).toBe(sellerNet);

    const updatedPayout = await Payout.findById(payout._id);
    expect(updatedPayout.status).toBe("approved");

    const updatedCommission = await Commission.findById(commission._id);
    expect(updatedCommission.status).toBe("cancelled");
    expect(updatedCommission.lockedBy).toBeNull();

    const reversal = await SellerLedger.findOne({
      seller: seller._id,
      type: "commission_reversed",
    });
    expect(reversal.amount).toBe(-sellerNet);

    await validateSellerLedgerIntegrity(seller._id);
  });

  it("claws back paid commission via ledger only (Scenario D)", async () => {
    const { order, returnRequest, commission, seller, sellerNet } = await seedBase({
      commissionStatus: "paid",
    });

    const result = await processRefundFinancialReversal({
      returnRequestId: returnRequest._id,
      orderId: order._id,
    });

    expect(result.summary.commissionsClawedBack).toBe(1);
    expect(result.summary.commissionsCancelled).toBe(0);

    const updatedCommission = await Commission.findById(commission._id);
    expect(updatedCommission.status).toBe("paid");

    const reversal = await SellerLedger.findOne({
      seller: seller._id,
      type: "commission_reversed",
    });
    expect(reversal.amount).toBe(-sellerNet);
  });

  it("reverses commissions for COD delivered orders with pending payment (Scenario E)", async () => {
    const { order, returnRequest, commission, seller, sellerNet } = await seedBase({
      paymentMethod: "cod",
      paymentStatus: "pending",
    });

    expect(order.paymentMethod).toBe("cod");
    expect(order.paymentStatus).toBe("pending");

    const result = await processRefundFinancialReversal({
      returnRequestId: returnRequest._id,
      orderId: order._id,
    });

    expect(result.summary.commissionsCancelled).toBe(1);
    expect(result.summary.ledgerReversalAmount).toBe(sellerNet);

    const updatedCommission = await Commission.findById(commission._id);
    expect(updatedCommission.status).toBe("cancelled");

    const reversal = await SellerLedger.findOne({
      seller: seller._id,
      type: "commission_reversed",
    });
    expect(reversal.amount).toBe(-sellerNet);

    await validateSellerLedgerIntegrity(seller._id);
  });

  it("reverses all commissions independently on multi-seller orders", async () => {
    const {
      order,
      returnRequest,
      sellerA,
      sellerB,
      commissionA,
      commissionB,
      sellerNetA,
      sellerNetB,
    } = await seedMultiSeller();

    const result = await processRefundFinancialReversal({
      returnRequestId: returnRequest._id,
      orderId: order._id,
    });

    expect(result.summary.commissionsCancelled).toBe(2);
    expect(result.summary.ledgerReversalAmount).toBeCloseTo(sellerNetA + sellerNetB, 2);

    expect((await Commission.findById(commissionA._id)).status).toBe("cancelled");
    expect((await Commission.findById(commissionB._id)).status).toBe("cancelled");

    const reversalA = await SellerLedger.findOne({
      seller: sellerA._id,
      type: "commission_reversed",
    });
    const reversalB = await SellerLedger.findOne({
      seller: sellerB._id,
      type: "commission_reversed",
    });
    expect(reversalA.amount).toBe(-sellerNetA);
    expect(reversalB.amount).toBe(-sellerNetB);

    await validateSellerLedgerIntegrity(sellerA._id);
    await validateSellerLedgerIntegrity(sellerB._id);
  });

  it("skips seller reversal when no commission exists (Scenario F6)", async () => {
    const { order, returnRequest } = await seedBase();
    await Commission.deleteMany({});

    const result = await processRefundFinancialReversal({
      returnRequestId: returnRequest._id,
      orderId: order._id,
    });

    expect(result.summary.skippedNoCommission).toBe(true);
    expect(result.summary.commissionsCancelled).toBe(0);
  });

  it("is idempotent for the same return request", async () => {
    const { order, returnRequest } = await seedBase();

    const first = await processRefundFinancialReversal({
      returnRequestId: returnRequest._id,
      orderId: order._id,
    });

    returnRequest.financialReversalProcessedAt = new Date();
    returnRequest.financialReversalSummary = first.summary;
    await returnRequest.save();

    const second = await processRefundFinancialReversal({
      returnRequestId: returnRequest._id,
      orderId: order._id,
    });

    expect(second.skipped).toBe(true);
    const reversalCount = await SellerLedger.countDocuments({ type: "commission_reversed" });
    expect(reversalCount).toBe(1);
  });
});
