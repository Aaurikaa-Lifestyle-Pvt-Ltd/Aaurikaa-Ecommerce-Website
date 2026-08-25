/**
 * Cross-phase shopper order lifecycle regression (Phases 1–8).
 * Validation-only: asserts governance coexistence and DTO contract stability.
 */
const { shopperOrderListDTO } = require("../../services/shopperOrderListService");
const { shopperOrderDetailDTO } = require("../../services/shopperOrderDetailService");
const { getCancellationEligibility } = require("../../services/cancellationEligibilityService");
const { isArchivedForShopper } = require("../../services/orderArchiveVisibilityService");
const {
  evaluateEligibility,
  getManualConfirmationStatus,
} = require("../../services/manualConfirmationService");
const { addItemToShopperCart } = require("../../services/cartAddService");
const { processBuyAgain } = require("../../services/buyAgainService");

jest.mock("../../models/Order");
jest.mock("../../models/Product");
jest.mock("../../models/Shopper");
jest.mock("../../services/cartAddService", () => ({
  addItemToShopperCart: jest.fn(),
}));

const Order = require("../../models/Order");
const Product = require("../../models/Product");
const Shopper = require("../../models/Shopper");

const SHOPPER_ID = "507f1f77bcf86cd799439099";
const REFERENCE_DATE = new Date("2026-05-27T14:00:00.000Z");

const LIST_DTO_KEYS = [
  "_id",
  "orderId",
  "createdAt",
  "total",
  "orderStatus",
  "paymentVisibility",
  "trackingSummary",
  "cancelEligibility",
  "invoiceAvailable",
  "itemsPreview",
  "manualConfirmation",
];

const DETAIL_DTO_KEYS = [
  "_id",
  "orderId",
  "createdAt",
  "orderStatus",
  "paymentVisibility",
  "shipmentSummary",
  "invoiceSummary",
  "pricingSummary",
  "items",
  "sellerSummary",
  "statusTimeline",
  "reviewEligibility",
  "cancelEligibility",
  "manualConfirmation",
];

describe("Shopper order lifecycle regression (Phases 1–8)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("DTO contract stability", () => {
    it("listing DTO exposes all phase-normalized fields without raw order leakage", () => {
      const dto = shopperOrderListDTO(
        {
          _id: "507f1f77bcf86cd799439011",
          invoiceNumber: "INV-20260101-0001",
          status: "paid",
          totalAmount: 499,
          paymentMethod: "cod",
          paymentStatus: "pending",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          items: [
            {
              quantity: 1,
              product: { name: "Widget", slug: "widget", mainImage: "img.png" },
            },
          ],
          shiprocketShipments: [],
        },
        {
          manualConfirmation: { eligible: true, status: "CALL_PENDING" },
        }
      );

      expect(Object.keys(dto).sort()).toEqual(LIST_DTO_KEYS.sort());
      expect(dto.cancelEligibility).toMatchObject({ eligible: expect.any(Boolean), reason: expect.any(String) });
      expect(dto.manualConfirmation).toEqual({ eligible: true, status: "CALL_PENDING" });
      expect(dto).not.toHaveProperty("buyer");
      expect(dto).not.toHaveProperty("shiprocketShipments");
    });

    it("detail DTO exposes all phase-normalized fields without admin-only metadata", () => {
      const dto = shopperOrderDetailDTO(
        {
          _id: "507f1f77bcf86cd799439011",
          invoiceNumber: "INV-20260101-0001",
          status: "delivered",
          totalAmount: 1299,
          paymentMethod: "cod",
          paymentStatus: "success",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
          shippingCharge: 0,
          bulkDiscountSummary: {},
          coupon: {},
          tax: { totalTaxAmount: 0 },
          items: [
            {
              quantity: 1,
              price: 1299,
              product: {
                _id: "507f1f77bcf86cd799439012",
                name: "Widget",
                slug: "widget",
                seller: { shopName: "Shop", shopUrl: "shop" },
              },
            },
          ],
          shiprocketShipments: [{ status: "delivered", trackingNumber: "AWB1" }],
        },
        {
          shopperId: SHOPPER_ID,
          reviewedProductIds: new Set(),
          manualConfirmation: { eligible: false, status: "CONFIRMED" },
        }
      );

      expect(Object.keys(dto).sort()).toEqual(DETAIL_DTO_KEYS.sort());
      expect(dto.manualConfirmation).toEqual({ eligible: false, status: "CONFIRMED" });
      expect(dto).not.toHaveProperty("manualConfirmationNotes");
      expect(dto).not.toHaveProperty("manualConfirmationBy");
    });
  });

  describe("cross-governance coexistence", () => {
    const archivedDeliveredOrder = {
      _id: "archived1",
      buyer: SHOPPER_ID,
      status: "delivered",
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
      trackingNumber: "AWB-OLD",
      shiprocketShipments: [{ trackingNumber: "AWB-OLD" }],
    };

    it("archive hides from listing scope but detail/cancellation read layers remain independent", () => {
      expect(isArchivedForShopper(archivedDeliveredOrder, REFERENCE_DATE)).toBe(true);

      const cancelEligibility = getCancellationEligibility(archivedDeliveredOrder);
      expect(cancelEligibility.eligible).toBe(false);
      expect(cancelEligibility.reason).toBe("ORDER_ALREADY_DELIVERED");
    });

    it("cancellation governance blocks shipment/AWB without mutating fulfillment state", () => {
      const blocked = getCancellationEligibility({
        status: "paid",
        trackingNumber: "AWB123",
        shiprocketShipments: [{ status: "created" }],
      });

      expect(blocked.eligible).toBe(false);
      expect(["AWB_ASSIGNED", "SHIPMENT_CREATED"]).toContain(blocked.reason);
    });

    it("manual confirmation excludes cancelled orders while archive and cancellation differ", () => {
      const cancelledRecent = {
        buyer: SHOPPER_ID,
        status: "cancelled",
        createdAt: new Date("2026-05-27T10:00:00.000Z"),
      };
      const cancelledOld = {
        buyer: SHOPPER_ID,
        status: "cancelled",
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
      };

      expect(
        evaluateEligibility(cancelledRecent, SHOPPER_ID, [], REFERENCE_DATE)
      ).toBe(false);
      expect(getCancellationEligibility(cancelledRecent).reason).toBe("ORDER_ALREADY_CANCELLED");
      expect(isArchivedForShopper(cancelledRecent, REFERENCE_DATE)).toBe(false);
      expect(isArchivedForShopper(cancelledOld, REFERENCE_DATE)).toBe(true);
    });

    it("manual confirmation first-3 cohort is independent of archive filter", () => {
      const recentPaid = {
        buyer: SHOPPER_ID,
        status: "paid",
        createdAt: new Date("2026-05-27T13:30:00.000Z"),
      };

      expect(evaluateEligibility(recentPaid, SHOPPER_ID, [], REFERENCE_DATE)).toBe(true);
      expect(isArchivedForShopper(recentPaid, REFERENCE_DATE)).toBe(false);
      expect(getManualConfirmationStatus(recentPaid, { eligible: true })).toEqual({
        status: "CALL_PENDING",
        eligible: true,
      });

      const olderPaid = {
        buyer: SHOPPER_ID,
        status: "paid",
        createdAt: new Date("2026-05-27T10:00:00.000Z"),
      };

      expect(evaluateEligibility(olderPaid, SHOPPER_ID, [], REFERENCE_DATE)).toBe(true);
      expect(getManualConfirmationStatus(olderPaid, { eligible: true })).toEqual({
        status: "CALL_PENDING",
        eligible: true,
      });
    });
  });

  describe("Buy Again regression guardrails", () => {
    it("reuses cartAddService and never writes historical order price to cart", async () => {
      const shopperDoc = {
        _id: SHOPPER_ID,
        cart: [],
        save: jest.fn().mockResolvedValue(true),
      };

      Order.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: "507f1f77bcf86cd799439011",
          buyer: SHOPPER_ID,
          items: [
            {
              product: { _id: "507f1f77bcf86cd799439012", name: "Widget" },
              quantity: 2,
              price: 1,
            },
          ],
        }),
      });
      Shopper.findById.mockResolvedValue(shopperDoc);
      Product.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: "507f1f77bcf86cd799439012",
          name: "Widget",
          status: "published",
          approvalStatus: "approved",
          seller: { isApproved: true },
          stock: 5,
          variants: [],
        }),
      });
      addItemToShopperCart.mockResolvedValue({ success: true });

      const result = await processBuyAgain({
        orderId: "507f1f77bcf86cd799439011",
        shopperId: SHOPPER_ID,
      });

      expect(result.success).toBe(true);
      expect(addItemToShopperCart).toHaveBeenCalledWith(
        shopperDoc,
        expect.objectContaining({
          productId: "507f1f77bcf86cd799439012",
          quantity: 2,
        })
      );
      expect(addItemToShopperCart.mock.calls[0][1]).not.toHaveProperty("price");
    });
  });

  describe("legacy route inventory (documentation guard)", () => {
    it("documents GET /api/orders/my-orders as raw-order legacy bypass", () => {
      const fs = require("fs");
      const path = require("path");
      const source = fs.readFileSync(
        path.join(__dirname, "../../routes/orderRoutes.js"),
        "utf8"
      );

      expect(source).toMatch(/router\.get\("\/my-orders"/);
      expect(source).toMatch(/Order\.find\(\{ buyer: req\.user\.id \}\)/);
      expect(source).not.toMatch(/shopperOrderListDTO/);
      expect(source).not.toMatch(/buildShopperVisibleOrderFilter/);
    });

    it("seller order listing does not apply shopper archive filter", () => {
      const fs = require("fs");
      const path = require("path");
      const source = fs.readFileSync(
        path.join(__dirname, "../../controllers/sellerOrderController.js"),
        "utf8"
      );

      expect(source).toMatch(/exports\.getSellerOrders/);
      expect(source).not.toMatch(/orderArchiveVisibilityService/);
      expect(source).not.toMatch(/buildShopperVisibleOrderFilter/);
    });

    it("admin order listing does not apply shopper archive filter", () => {
      const fs = require("fs");
      const path = require("path");
      const source = fs.readFileSync(
        path.join(__dirname, "../../routes/adminOrderRoutes.js"),
        "utf8"
      );

      expect(source).toMatch(/router\.get\("\/", verifyAdmin/);
      expect(source).not.toMatch(/buildShopperVisibleOrderFilter/);
    });
  });
});
