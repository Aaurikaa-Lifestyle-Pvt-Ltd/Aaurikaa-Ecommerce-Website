jest.mock("../../models/Order");
jest.mock("../../models/Product");
jest.mock("../../models/Shopper");

const Order = require("../../models/Order");
const Product = require("../../models/Product");
const Shopper = require("../../models/Shopper");
const {
  processBuyAgain,
  FAILURE_REASON,
} = require("../../services/buyAgainService");
const { addItemToShopperCart } = require("../../services/cartAddService");

jest.mock("../../services/cartAddService", () => ({
  addItemToShopperCart: jest.fn(),
}));

describe("buyAgainService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns notFound when order is not owned", async () => {
    Order.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });

    const result = await processBuyAgain({
      orderId: "507f1f77bcf86cd799439011",
      shopperId: "507f1f77bcf86cd799439099",
    });

    expect(result.notFound).toBe(true);
  });

  it("adds valid items and reports partial failures", async () => {
    const shopperDoc = { _id: "507f1f77bcf86cd799439099", cart: [], save: jest.fn().mockResolvedValue(true) };

    Order.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        items: [
          {
            product: { _id: "507f1f77bcf86cd799439012", name: "Valid Product" },
            quantity: 2,
          },
          {
            product: { _id: "507f1f77bcf86cd799439013", name: "Missing Product" },
            quantity: 1,
          },
        ],
      }),
    });

    Shopper.findById.mockResolvedValue(shopperDoc);

    Product.findById
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: "507f1f77bcf86cd799439012",
          name: "Valid Product",
          status: "published",
          approvalStatus: "approved",
          seller: { isApproved: true },
          stock: 10,
          variants: [],
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

    addItemToShopperCart.mockResolvedValue({
      success: true,
      productName: "Valid Product",
    });

    const result = await processBuyAgain({
      orderId: "507f1f77bcf86cd799439011",
      shopperId: "507f1f77bcf86cd799439099",
    });

    expect(result.success).toBe(true);
    expect(result.addedItems).toHaveLength(1);
    expect(result.failedItems).toHaveLength(1);
    expect(result.failedItems[0].reason).toBe(FAILURE_REASON.PRODUCT_NOT_FOUND);
    expect(shopperDoc.save).toHaveBeenCalled();
  });

  it("marks inactive products as PRODUCT_INACTIVE", async () => {
    const shopperDoc = { _id: "507f1f77bcf86cd799439099", cart: [], save: jest.fn() };

    Order.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        items: [{ product: { _id: "507f1f77bcf86cd799439012", name: "Draft Product" }, quantity: 1 }],
      }),
    });
    Shopper.findById.mockResolvedValue(shopperDoc);
    Product.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439012",
        name: "Draft Product",
        status: "draft",
        approvalStatus: "pending",
        seller: { isApproved: true },
      }),
    });

    const result = await processBuyAgain({
      orderId: "507f1f77bcf86cd799439011",
      shopperId: "507f1f77bcf86cd799439099",
    });

    expect(result.success).toBe(false);
    expect(result.failedItems[0].reason).toBe(FAILURE_REASON.PRODUCT_INACTIVE);
    expect(shopperDoc.save).not.toHaveBeenCalled();
  });
});
