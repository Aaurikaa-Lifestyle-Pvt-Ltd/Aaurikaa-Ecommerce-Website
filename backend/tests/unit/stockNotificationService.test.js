jest.mock("../../models/Product");
jest.mock("../../models/Shopper");
jest.mock("../../models/StockNotificationRequest");
jest.mock("../../utils/sendMail");

const Product = require("../../models/Product");
const Shopper = require("../../models/Shopper");
const StockNotificationRequest = require("../../models/StockNotificationRequest");
const sendMail = require("../../utils/sendMail");
const {
  createStockNotificationRequest,
  processRestockNotificationsForProduct,
  getAvailableStock,
} = require("../../services/stockNotificationService");

const SHOPPER_ID = "507f1f77bcf86cd799439099";
const PRODUCT_ID = "507f1f77bcf86cd799439012";

describe("stockNotificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAvailableStock", () => {
    it("returns product stock for non-variant products", () => {
      expect(getAvailableStock({ stock: 5, variants: [] }, null)).toBe(5);
    });

    it("returns variant stock when variant is selected", () => {
      const product = {
        variants: [{ type: "Color", values: ["Red"] }],
        variantStock: { "color:red": 3 },
      };
      expect(getAvailableStock(product, { Color: "Red" })).toBe(3);
    });
  });

  describe("createStockNotificationRequest", () => {
    it("rejects when product is already in stock", async () => {
      Shopper.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ _id: SHOPPER_ID, email: "a@test.com" }),
      });
      Product.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: PRODUCT_ID,
          name: "In Stock Product",
          status: "published",
          approvalStatus: "approved",
          stock: 10,
          variants: [],
        }),
      });

      const result = await createStockNotificationRequest({
        shopperId: SHOPPER_ID,
        productId: PRODUCT_ID,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.message).toMatch(/already in stock/i);
    });

    it("creates a pending request for out-of-stock product", async () => {
      Shopper.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: SHOPPER_ID,
          email: "shopper@test.com",
          firstName: "Test",
          lastName: "Shopper",
        }),
      });
      Product.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: PRODUCT_ID,
          name: "OOS Product",
          slug: "oos-product",
          status: "published",
          approvalStatus: "approved",
          stock: 0,
          variants: [],
        }),
      });
      StockNotificationRequest.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      StockNotificationRequest.create.mockResolvedValue({ _id: "507f1f77bcf86cd799439020" });

      const result = await createStockNotificationRequest({
        shopperId: SHOPPER_ID,
        productId: PRODUCT_ID,
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(201);
      expect(StockNotificationRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          shopper: SHOPPER_ID,
          product: PRODUCT_ID,
          status: "pending",
        })
      );
    });

    it("prevents duplicate pending requests", async () => {
      Shopper.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ _id: SHOPPER_ID, email: "shopper@test.com" }),
      });
      Product.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: PRODUCT_ID,
          name: "OOS Product",
          status: "published",
          approvalStatus: "approved",
          stock: 0,
          variants: [],
        }),
      });
      StockNotificationRequest.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "507f1f77bcf86cd799439020" }),
      });

      const result = await createStockNotificationRequest({
        shopperId: SHOPPER_ID,
        productId: PRODUCT_ID,
      });

      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(true);
      expect(StockNotificationRequest.create).not.toHaveBeenCalled();
    });

    it("requires variant selection for variant products", async () => {
      Shopper.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ _id: SHOPPER_ID, email: "shopper@test.com" }),
      });
      Product.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: PRODUCT_ID,
          name: "Variant Product",
          status: "published",
          approvalStatus: "approved",
          stock: 0,
          variants: [{ type: "Color", values: ["Red", "Blue"] }],
          variantStock: { "color:red": 0, "color:blue": 0 },
        }),
      });

      const result = await createStockNotificationRequest({
        shopperId: SHOPPER_ID,
        productId: PRODUCT_ID,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.message).toMatch(/variant selection/i);
    });

    it("creates variant-specific request", async () => {
      Shopper.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ _id: SHOPPER_ID, email: "shopper@test.com" }),
      });
      Product.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: PRODUCT_ID,
          name: "Variant Product",
          slug: "variant-product",
          status: "published",
          approvalStatus: "approved",
          stock: 0,
          variants: [{ type: "Color", values: ["Red", "Blue"] }],
          variantStock: { "color:red": 0, "color:blue": 5 },
        }),
      });
      StockNotificationRequest.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      StockNotificationRequest.create.mockResolvedValue({ _id: "507f1f77bcf86cd799439021" });

      const result = await createStockNotificationRequest({
        shopperId: SHOPPER_ID,
        productId: PRODUCT_ID,
        variantCombination: { Color: "Red" },
      });

      expect(result.success).toBe(true);
      expect(StockNotificationRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          variantCombination: { Color: "Red" },
          variantKey: "color:red",
        })
      );
    });
  });

  describe("processRestockNotificationsForProduct", () => {
    it("skips processing when no pending requests exist", async () => {
      StockNotificationRequest.countDocuments.mockResolvedValue(0);

      const result = await processRestockNotificationsForProduct(PRODUCT_ID);

      expect(result).toEqual({ processed: 0, notified: 0 });
      expect(Product.findById).not.toHaveBeenCalled();
    });

    it("notifies shoppers and marks requests completed when stock returns", async () => {
      StockNotificationRequest.countDocuments.mockResolvedValue(1);
      Product.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: PRODUCT_ID,
          name: "Back In Stock",
          slug: "back-in-stock",
          status: "published",
          approvalStatus: "approved",
          stock: 4,
          variants: [],
        }),
      });
      StockNotificationRequest.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          {
            _id: "507f1f77bcf86cd799439030",
            variantCombination: undefined,
            shopper: {
              email: "shopper@test.com",
              firstName: "Test",
              lastName: "Shopper",
            },
          },
        ]),
      });
      StockNotificationRequest.updateOne.mockResolvedValue({ modifiedCount: 1 });
      sendMail.mockResolvedValue(undefined);

      const result = await processRestockNotificationsForProduct(PRODUCT_ID);

      expect(result.notified).toBe(1);
      expect(sendMail).toHaveBeenCalled();
      expect(StockNotificationRequest.updateOne).toHaveBeenCalledWith(
        { _id: "507f1f77bcf86cd799439030", status: "pending" },
        expect.objectContaining({ $set: expect.objectContaining({ status: "notified" }) })
      );
    });

    it("does not notify when variant stock is still zero", async () => {
      StockNotificationRequest.countDocuments.mockResolvedValue(1);
      Product.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: PRODUCT_ID,
          name: "Variant Product",
          status: "published",
          approvalStatus: "approved",
          stock: 0,
          variants: [{ type: "Color", values: ["Red", "Blue"] }],
          variantStock: { "color:red": 0, "color:blue": 2 },
        }),
      });
      StockNotificationRequest.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          {
            _id: "507f1f77bcf86cd799439031",
            variantCombination: { Color: "Red" },
            shopper: { email: "shopper@test.com", firstName: "Test" },
          },
        ]),
      });

      const result = await processRestockNotificationsForProduct(PRODUCT_ID);

      expect(result.notified).toBe(0);
      expect(sendMail).not.toHaveBeenCalled();
    });
  });
});
