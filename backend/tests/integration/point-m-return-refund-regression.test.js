/**
 * Point M — Phase F full regression and financial scenario validation.
 * Covers governance coexistence (cancel/review/return), end-to-end admin workflow,
 * financial scenarios A–E, multi-seller, COD, and order_returns RBAC gates.
 */
const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");

const Admin = require("../../models/Admin");
const Commission = require("../../models/Commission");
const Order = require("../../models/Order");
const ReturnRequest = require("../../models/ReturnRequest");
const Seller = require("../../models/Seller");
const SellerLedger = require("../../models/SellerLedger");
const Shopper = require("../../models/Shopper");
const adminReturnRoutes = require("../../routes/adminReturnRoutes");
const { resetEnforcementCache } = require("../../config/permissionEnforcement");
const { getCancellationEligibility } = require("../../services/cancellationEligibilityService");
const { getReturnEligibility } = require("../../services/returnEligibilityService");
const { getReviewEligibility } = require("../../services/reviewEligibilityService");
const { createReturnRequest } = require("../../services/returnRequestService");
const {
  reviewReturnRequest,
  reviewRefundRequest,
  completeRefundRequest,
} = require("../../services/adminReturnService");
const { shopperOrderDetailDTO } = require("../../services/shopperOrderDetailService");
const { toPaymentVisibilityDTO } = require("../../services/paymentVisibilityService");
const { calcSellerNet } = require("../../services/returnRefundFinancialService");
const {
  buildBackfillPlan,
  applyBackfill,
} = require("../../scripts/backfill-order-delivered-at");

const TEST_PASSWORD = "TestPassword123!";
const EVIDENCE_CDN = "https://cdn.example.com";

function sampleNeedHelpEvidence(buyerId, orderId) {
  return [
    {
      url: `${EVIDENCE_CDN}/returns/evidence/${buyerId}/${orderId}/evidence.jpg`,
      mediaType: "image",
      fileName: "evidence.jpg",
    },
  ];
}

/** Keep certified admin refund regression on legacy caseFlow after Phase 2 cutover. */
async function forceLegacyCaseFlow(requestId) {
  await ReturnRequest.updateOne({ _id: requestId }, { $set: { caseFlow: "legacy" } });
}

const signAdminToken = (admin) =>
  jwt.sign(
    {
      id: admin._id,
      role: "admin",
      name: admin.name,
      isSuperAdmin: admin.isSuperAdmin ?? false,
      tokenVersion: admin.tokenVersion ?? 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

describe("Point M return/refund regression (Phase F)", () => {
  let mongoServer;
  let adminApp;
  let superAdmin;
  let superToken;
  let restrictedAdmin;
  let restrictedToken;
  let shopper;
  let seller;
  let adminId;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
    process.env.CLOUDFLARE_R2_PUBLIC_URL = EVIDENCE_CDN;
    process.env.PERMISSION_ENFORCEMENT = "true";
    process.env.PERMISSION_ENFORCED_DOMAINS = "*";
    resetEnforcementCache();

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    adminApp = express();
    adminApp.use(express.json());
    adminApp.use("/api/admin/returns", adminReturnRoutes);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Admin.deleteMany({});
    await Commission.deleteMany({});
    await Order.deleteMany({});
    await ReturnRequest.deleteMany({});
    await Seller.deleteMany({});
    await SellerLedger.deleteMany({});
    await Shopper.deleteMany({});

    superAdmin = await Admin.create({
      name: "Super Admin",
      username: "superadmin",
      email: "super@example.com",
      password: TEST_PASSWORD,
      isSuperAdmin: true,
      isActive: true,
      tokenVersion: 0,
    });
    superToken = signAdminToken(superAdmin);
    adminId = superAdmin._id;

    restrictedAdmin = await Admin.create({
      name: "Orders Only",
      username: "ordersonly",
      email: "orders@example.com",
      password: TEST_PASSWORD,
      isSuperAdmin: false,
      isActive: true,
      tokenVersion: 0,
      permissions: ["orders:view"],
    });
    restrictedToken = signAdminToken(restrictedAdmin);

    seller = await Seller.create({
      firstName: "Regression",
      lastName: "Seller",
      email: `seller-${Date.now()}@test.com`,
      username: `seller-${Date.now()}`,
      password: "password123",
      phone: "9999999999",
      shopName: "Regression Shop",
      shopUrl: `regression-shop-${Date.now()}`,
      bankAccount: {
        accountNumber: "1234567890",
        accountNumberConfirm: "1234567890",
        ifscCode: "SBIN0001234",
      },
    });

    shopper = await Shopper.create({
      firstName: "Regression",
      lastName: "Buyer",
      username: `buyer-${Date.now()}`,
      email: `buyer-${Date.now()}@test.com`,
      password: "password123",
      phone: "8888888888",
    });
  });

  async function seedDeliveredOrder({
    paymentMethod = "phonepe",
    paymentStatus = "success",
    totalAmount = 1500,
  } = {}) {
    const productId = new mongoose.Types.ObjectId();
    const order = await Order.create({
      buyer: shopper._id,
      items: [{ product: productId, quantity: 1, price: totalAmount, originalPrice: totalAmount }],
      totalAmount,
      shippingCharge: 0,
      status: "delivered",
      paymentStatus,
      paymentMethod,
      invoiceNumber: `INV-${Date.now()}`,
    });

    const commission = await Commission.create({
      order: order._id,
      seller: seller._id,
      product: productId,
      orderAmount: totalAmount,
      commissionRate: 10,
      commissionAmount: totalAmount * 0.1,
      commissionType: "percentage",
      appliedRule: "system_default",
      status: "approved",
      period: { year: 2026, month: 7 },
    });

    const sellerNet = calcSellerNet(commission);
    await SellerLedger.create({
      seller: seller._id,
      type: "commission_earned",
      amount: sellerNet,
      balanceAfter: sellerNet,
      reference: { model: "Commission", id: commission._id },
      description: "Commission earned on delivery",
    });

    return { order, productId, commission, sellerNet };
  }

  describe("governance coexistence regression", () => {
    it("blocks cancellation but allows return on delivered orders", () => {
      const order = { status: "delivered", deliveredAt: new Date() };

      expect(getCancellationEligibility(order).eligible).toBe(false);
      expect(getCancellationEligibility(order).reason).toBe("ORDER_ALREADY_DELIVERED");

      expect(getReturnEligibility(order).eligible).toBe(true);
      expect(getReturnEligibility(order).reason).toBe("ELIGIBLE");
    });

    it("blocks both cancellation (shipment) and return on shipped orders", () => {
      const order = {
        status: "shipped",
        trackingNumber: "AWB-REG-1",
        shiprocketShipments: [{ status: "in transit" }],
      };

      const cancel = getCancellationEligibility(order);
      expect(cancel.eligible).toBe(false);
      expect(["AWB_ASSIGNED", "ORDER_ALREADY_SHIPPED", "SHIPMENT_CREATED"]).toContain(cancel.reason);

      const returns = getReturnEligibility(order);
      expect(returns.eligible).toBe(false);
      expect(returns.reason).toBe("ORDER_NOT_DELIVERED");
    });

    it("allows cancellation but blocks return on pre-delivery pending orders", () => {
      const order = { status: "pending" };

      expect(getCancellationEligibility(order).eligible).toBe(true);
      expect(getReturnEligibility(order).eligible).toBe(false);
      expect(getReturnEligibility(order).reason).toBe("ORDER_NOT_DELIVERED");
    });

    it("keeps review eligibility independent of active return requests", () => {
      const order = {
        _id: new mongoose.Types.ObjectId(),
        status: "delivered",
        buyer: shopper._id,
        items: [{ product: { _id: new mongoose.Types.ObjectId() } }],
      };
      const activeRequest = { status: "pending_review" };

      expect(getReturnEligibility(order, activeRequest).eligible).toBe(false);

      const review = getReviewEligibility({
        order,
        shopperId: String(shopper._id),
        productId: String(order.items[0].product._id),
        reviewedProductIds: new Set(),
      });
      expect(review.eligible).toBe(true);
      expect(review.reason).toBe("ELIGIBLE");
    });
  });

  describe("shopper return request regression", () => {
    it("captures deliveredAt once across repeated saves and later transitions", async () => {
      const order = await Order.create({
        buyer: shopper._id,
        items: [{
          product: new mongoose.Types.ObjectId(),
          quantity: 1,
          price: 500,
          originalPrice: 500,
        }],
        totalAmount: 500,
        shippingCharge: 0,
        status: "processing",
        invoiceNumber: `INV-WRITE-ONCE-${Date.now()}`,
      });

      expect(order.deliveredAt).toBeNull();
      order.status = "delivered";
      await order.save();
      const captured = order.deliveredAt.getTime();

      order.sellerNotes = "Repeated save";
      order.deliveredAt = new Date(captured + 60_000);
      await order.save();
      expect(order.deliveredAt.getTime()).toBe(captured);

      order.status = "processing";
      await order.save();
      order.status = "delivered";
      await order.save();
      expect(order.deliveredAt.getTime()).toBe(captured);
    });

    it("creates a return request for a delivered order", async () => {
      const { order } = await seedDeliveredOrder();

      const result = await createReturnRequest({
        order,
        buyerId: shopper._id,
        reasonCode: "DEFECTIVE_DAMAGED",
        reasonText: null,
        evidence: sampleNeedHelpEvidence(shopper._id, order._id),
      });

      expect(result.success).toBe(true);
      expect(result.request.status).toBe("pending_review");
      expect(result.request.caseFlow).toBe("after_sales");
      expect(result.eligibility.eligible).toBe(false);
      expect(result.eligibility.reason).toBe("ACTIVE_REQUEST_EXISTS");
    });

    it("rejects return creation after the configured window", async () => {
      const { order } = await seedDeliveredOrder();
      await Order.collection.updateOne(
        { _id: order._id },
        {
          $set: {
            deliveredAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
          },
        }
      );
      const expiredOrder = await Order.findById(order._id);

      const result = await createReturnRequest({
        order: expiredOrder,
        buyerId: shopper._id,
        reasonCode: "DEFECTIVE_DAMAGED",
        returnWindowDays: 7,
      });

      expect(result.success).toBe(false);
      expect(result.eligibility.reason).toBe("RETURN_WINDOW_EXPIRED");
      expect(await ReturnRequest.countDocuments({ order: expiredOrder._id })).toBe(0);
    });

    it("prevents duplicate active return requests", async () => {
      const { order } = await seedDeliveredOrder();

      const first = await createReturnRequest({
        order,
        buyerId: shopper._id,
        reasonCode: "WRONG_ITEM",
        evidence: sampleNeedHelpEvidence(shopper._id, order._id),
      });
      expect(first.success).toBe(true);

      const second = await createReturnRequest({
        order,
        buyerId: shopper._id,
        reasonCode: "CHANGE_OF_MIND",
        evidence: sampleNeedHelpEvidence(shopper._id, order._id),
      });
      expect(second.success).toBe(false);
      expect(second.eligibility.reason).toBe("ACTIVE_REQUEST_EXISTS");
    });

    it("allows COD delivered orders to submit return requests", async () => {
      const { order } = await seedDeliveredOrder({
        paymentMethod: "cod",
        paymentStatus: "pending",
      });

      const result = await createReturnRequest({
        order,
        buyerId: shopper._id,
        reasonCode: "NOT_AS_DESCRIBED",
        evidence: sampleNeedHelpEvidence(shopper._id, order._id),
      });

      expect(result.success).toBe(true);
      expect(order.paymentMethod).toBe("cod");
      expect(order.paymentStatus).toBe("pending");
    });
  });

  describe("historical deliveredAt backfill", () => {
    it("uses the earliest commission and remains idempotent", async () => {
      const orderId = new mongoose.Types.ObjectId();
      const productId = new mongoose.Types.ObjectId();
      await Order.collection.insertOne({
        _id: orderId,
        buyer: shopper._id,
        items: [{
          product: productId,
          quantity: 1,
          price: 500,
          originalPrice: 500,
        }],
        totalAmount: 500,
        shippingCharge: 0,
        status: "delivered",
        invoiceNumber: `INV-BACKFILL-${Date.now()}`,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-10T00:00:00.000Z"),
      });

      await Commission.create([
        {
          order: orderId,
          seller: seller._id,
          product: productId,
          orderAmount: 500,
          commissionRate: 10,
          commissionAmount: 50,
          appliedRule: "system_default",
          period: { year: 2026, month: 6 },
          createdAt: new Date("2026-06-10T08:00:00.000Z"),
        },
        {
          order: orderId,
          seller: seller._id,
          product: productId,
          orderAmount: 500,
          commissionRate: 10,
          commissionAmount: 50,
          appliedRule: "system_default",
          period: { year: 2026, month: 6 },
          createdAt: new Date("2026-06-10T07:00:00.000Z"),
        },
      ]);

      const plan = await buildBackfillPlan(
        new Date("2026-07-18T00:00:00.000Z")
      );
      expect(plan).toHaveLength(1);
      expect(plan[0].source).toBe("earliest_commission");
      expect(plan[0].deliveredAt.toISOString()).toBe(
        "2026-06-10T07:00:00.000Z"
      );

      expect(await applyBackfill(plan)).toEqual({ updated: 1, skipped: 0 });
      expect(await applyBackfill(plan)).toEqual({ updated: 0, skipped: 1 });
      expect(await buildBackfillPlan(new Date())).toHaveLength(0);
    });
  });

  describe("end-to-end admin workflow (Scenario A)", () => {
    it("holds Admin refund review/complete under SEC-006 (AAURIKAA policy HOLD)", async () => {
      const { order } = await seedDeliveredOrder();

      const created = await createReturnRequest({
        order,
        buyerId: shopper._id,
        reasonCode: "DEFECTIVE_DAMAGED",
        evidence: sampleNeedHelpEvidence(shopper._id, order._id),
      });
      expect(created.success).toBe(true);
      await forceLegacyCaseFlow(created.request._id);

      const approved = await reviewReturnRequest({
        requestId: created.request._id,
        adminId,
        action: "approve",
        note: "Eligible",
      });
      expect(approved.request.status).toBe("approved");

      const { REFUND_HOLD_MESSAGE } = require("../../services/adminAfterSalesOpsService");

      const refundApproved = await reviewRefundRequest({
        requestId: created.request._id,
        adminId,
        action: "approve",
      });
      expect(refundApproved.notAllowed).toBe(true);
      expect(refundApproved.message).toBe(REFUND_HOLD_MESSAGE);

      const completed = await completeRefundRequest({
        requestId: created.request._id,
        adminId,
        note: "Manual refund processed",
      });
      expect(completed.notAllowed).toBe(true);
      expect(completed.message).toBe(REFUND_HOLD_MESSAGE);

      const stillOpen = await ReturnRequest.findById(created.request._id);
      expect(stillOpen.status).toBe("approved");
    });
  });

  describe("COD refund workflow (Scenario E)", () => {
    it("holds Admin COD refund complete under SEC-006 (AAURIKAA policy HOLD)", async () => {
      const { order } = await seedDeliveredOrder({
        paymentMethod: "cod",
        paymentStatus: "pending",
      });

      const visibility = toPaymentVisibilityDTO(order);
      expect(visibility.paymentMethod).toBe("COD");
      expect(visibility.paymentStatus).toBe("PENDING");

      const created = await createReturnRequest({
        order,
        buyerId: shopper._id,
        reasonCode: "QUALITY_NOT_SATISFACTORY",
        evidence: sampleNeedHelpEvidence(shopper._id, order._id),
      });
      expect(created.success).toBe(true);
      await forceLegacyCaseFlow(created.request._id);

      await reviewReturnRequest({
        requestId: created.request._id,
        adminId,
        action: "approve",
      });

      const { REFUND_HOLD_MESSAGE } = require("../../services/adminAfterSalesOpsService");
      const refundApproved = await reviewRefundRequest({
        requestId: created.request._id,
        adminId,
        action: "approve",
      });
      expect(refundApproved.notAllowed).toBe(true);
      expect(refundApproved.message).toBe(REFUND_HOLD_MESSAGE);

      const completed = await completeRefundRequest({
        requestId: created.request._id,
        adminId,
        note: "COD bank transfer refund",
      });
      expect(completed.notAllowed).toBe(true);
      expect(completed.message).toBe(REFUND_HOLD_MESSAGE);

      const refreshedOrder = await Order.findById(order._id);
      expect(refreshedOrder.paymentMethod).toBe("cod");
      expect(refreshedOrder.paymentStatus).toBe("pending");
      expect(refreshedOrder.status).toBe("delivered");
    });
  });

  describe("multi-seller full-order return", () => {
    it("holds Admin multi-seller refund complete under SEC-006 (AAURIKAA policy HOLD)", async () => {
      const sellerB = await Seller.create({
        firstName: "Second",
        lastName: "Seller",
        email: `seller-b-${Date.now()}@test.com`,
        username: `seller-b-${Date.now()}`,
        password: "password123",
        phone: "9777777777",
        shopName: "Shop B",
        shopUrl: `shop-b-${Date.now()}`,
        bankAccount: {
          accountNumber: "2222222222",
          accountNumberConfirm: "2222222222",
          ifscCode: "SBIN0001234",
        },
      });

      const productA = new mongoose.Types.ObjectId();
      const productB = new mongoose.Types.ObjectId();

      const order = await Order.create({
        buyer: shopper._id,
        items: [
          { product: productA, quantity: 1, price: 600, originalPrice: 600 },
          { product: productB, quantity: 1, price: 900, originalPrice: 900 },
        ],
        totalAmount: 1500,
        shippingCharge: 0,
        status: "delivered",
        paymentStatus: "success",
        paymentMethod: "phonepe",
        invoiceNumber: "INV-MULTI-REG",
      });

      const commissionA = await Commission.create({
        order: order._id,
        seller: seller._id,
        product: productA,
        orderAmount: 600,
        commissionRate: 10,
        commissionAmount: 60,
        commissionType: "percentage",
        appliedRule: "system_default",
        status: "approved",
        period: { year: 2026, month: 7 },
      });

      const commissionB = await Commission.create({
        order: order._id,
        seller: sellerB._id,
        product: productB,
        orderAmount: 900,
        commissionRate: 10,
        commissionAmount: 90,
        commissionType: "percentage",
        appliedRule: "system_default",
        status: "approved",
        period: { year: 2026, month: 7 },
      });

      const sellerNetA = calcSellerNet(commissionA);
      const sellerNetB = calcSellerNet(commissionB);

      await SellerLedger.create({
        seller: seller._id,
        type: "commission_earned",
        amount: sellerNetA,
        balanceAfter: sellerNetA,
        reference: { model: "Commission", id: commissionA._id },
        description: "Seller A commission",
      });
      await SellerLedger.create({
        seller: sellerB._id,
        type: "commission_earned",
        amount: sellerNetB,
        balanceAfter: sellerNetB,
        reference: { model: "Commission", id: commissionB._id },
        description: "Seller B commission",
      });

      const created = await createReturnRequest({
        order,
        buyerId: shopper._id,
        reasonCode: "WRONG_ITEM",
        evidence: sampleNeedHelpEvidence(shopper._id, order._id),
      });
      expect(created.success).toBe(true);
      await forceLegacyCaseFlow(created.request._id);

      await reviewReturnRequest({ requestId: created.request._id, adminId, action: "approve" });

      const { REFUND_HOLD_MESSAGE } = require("../../services/adminAfterSalesOpsService");
      const refundApproved = await reviewRefundRequest({
        requestId: created.request._id,
        adminId,
        action: "approve",
      });
      expect(refundApproved.notAllowed).toBe(true);
      expect(refundApproved.message).toBe(REFUND_HOLD_MESSAGE);

      const completed = await completeRefundRequest({
        requestId: created.request._id,
        adminId,
        note: "Multi-seller refund",
      });
      expect(completed.notAllowed).toBe(true);
      expect(completed.message).toBe(REFUND_HOLD_MESSAGE);

      expect((await Commission.findById(commissionA._id)).status).toBe("approved");
      expect((await Commission.findById(commissionB._id)).status).toBe("approved");
    });
  });

  describe("shopper DTO enrichment regression", () => {
    it("includes return eligibility and request summary on order detail DTO", async () => {
      const { order } = await seedDeliveredOrder();
      const created = await createReturnRequest({
        order,
        buyerId: shopper._id,
        reasonCode: "OTHER",
        reasonText: "Packaging issue",
        evidence: sampleNeedHelpEvidence(shopper._id, order._id),
      });

      const dto = shopperOrderDetailDTO(order, {
        shopperId: String(shopper._id),
        reviewedProductIds: new Set(),
        existingReturnRequest: created.request,
        returnRequest: {
          _id: created.request._id,
          status: created.request.status,
          reasonCode: created.request.reasonCode,
        },
      });

      expect(dto.returnEligibility.eligible).toBe(false);
      expect(dto.returnEligibility.reason).toBe("ACTIVE_REQUEST_EXISTS");
      expect(dto.returnRequest.status).toBe("pending_review");
      expect(dto.orderStatus).toBe("delivered");
      expect(dto.cancelEligibility.eligible).toBe(false);
    });
  });

  describe("order_returns RBAC regression", () => {
    it("allows Super Admin through return queue and review routes", async () => {
      await request(adminApp)
        .get("/api/admin/returns")
        .set(authHeader(superToken))
        .expect(200);
    });

    it("denies admin without order_returns permission on return queue", async () => {
      const res = await request(adminApp)
        .get("/api/admin/returns")
        .set(authHeader(restrictedToken))
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it("denies admin without order_returns permission on refund completion", async () => {
      const { order } = await seedDeliveredOrder();
      const created = await createReturnRequest({
        order,
        buyerId: shopper._id,
        reasonCode: "DEFECTIVE_DAMAGED",
        evidence: sampleNeedHelpEvidence(shopper._id, order._id),
      });
      await forceLegacyCaseFlow(created.request._id);

      await reviewReturnRequest({ requestId: created.request._id, adminId, action: "approve" });
      // Seed refund_approved without Admin refund processing (SEC-006 HOLD)
      await ReturnRequest.findByIdAndUpdate(created.request._id, {
        status: "refund_approved",
      });

      const res = await request(adminApp)
        .patch(`/api/admin/returns/${created.request._id}/refund-complete`)
        .set(authHeader(restrictedToken))
        .send({ note: "Should be denied" })
        .expect(403);

      expect(res.body.success).toBe(false);

      const stillOpen = await ReturnRequest.findById(created.request._id);
      expect(stillOpen.status).toBe("refund_approved");
    });
  });
});
