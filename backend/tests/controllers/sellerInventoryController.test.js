// backend/tests/controllers/sellerInventoryController.test.js

const Product = require("../../models/Product");
const Order = require("../../models/Order");
const { sendErrorResponse, sendSuccessResponse } = require("../../utils/errorHandler");

// Mock dependencies
jest.mock("../../models/Product");
jest.mock("../../models/Order");
jest.mock("../../utils/errorHandler");

// Import after mocking
const {
  getLowStockProducts,
  getInventorySummary,
  updateProductStock,
  getStockMovementHistory,
  getInventoryAlerts
} = require("../../controllers/sellerInventoryController");

describe("Seller Inventory Controller", () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      user: { _id: "seller123" },
      params: {},
      query: {},
      body: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();

    // Reset mocks
    jest.clearAllMocks();
  });

  describe("getLowStockProducts", () => {
    it("should return low stock products successfully", async () => {
      const mockProducts = [
        { 
          _id: "prod1", 
          name: "Product 1", 
          sku: "SKU1", 
          stock: 5, 
          seller: "seller123",
          toObject: jest.fn().mockReturnValue({
            _id: "prod1", 
            name: "Product 1", 
            sku: "SKU1", 
            stock: 5, 
            seller: "seller123"
          })
        },
        { 
          _id: "prod2", 
          name: "Product 2", 
          sku: "SKU2", 
          stock: 0, 
          seller: "seller123",
          toObject: jest.fn().mockReturnValue({
            _id: "prod2", 
            name: "Product 2", 
            sku: "SKU2", 
            stock: 0, 
            seller: "seller123"
          })
        }
      ];

      Product.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockResolvedValue(mockProducts)
        })
      });

      await getLowStockProducts(mockReq, mockRes);

      expect(Product.find).toHaveBeenCalledWith({
        seller: "seller123",
        stock: { $lte: 10 }
      });
      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        200,
        "Low stock products retrieved successfully",
        expect.objectContaining({
          products: expect.arrayContaining([
            expect.objectContaining({
              _id: "prod1",
              name: "Product 1",
              stockStatus: "low_stock"
            }),
            expect.objectContaining({
              _id: "prod2",
              name: "Product 2",
              stockStatus: "out_of_stock"
            })
          ]),
          count: 2,
          threshold: 10
        })
      );
    });

    it("should handle custom threshold", async () => {
      mockReq.query.threshold = "5";
      const mockProducts = [{ 
        _id: "prod1", 
        name: "Product 1", 
        stock: 3,
        toObject: jest.fn().mockReturnValue({
          _id: "prod1", 
          name: "Product 1", 
          stock: 3
        })
      }];

      Product.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockResolvedValue(mockProducts)
        })
      });

      await getLowStockProducts(mockReq, mockRes);

      expect(Product.find).toHaveBeenCalledWith({
        seller: "seller123",
        stock: { $lte: 5 }
      });
    });

    it("should handle missing seller ID", async () => {
      mockReq.user = {};

      await getLowStockProducts(mockReq, mockRes);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        400,
        "Invalid seller ID",
        "INVALID_INPUT"
      );
    });

    it("should handle database errors", async () => {
      Product.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockRejectedValue(new Error("Database error"))
        })
      });

      await getLowStockProducts(mockReq, mockRes);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        500,
        "Failed to retrieve low stock products",
        "INTERNAL_ERROR"
      );
    });
  });

  describe("getInventorySummary", () => {
    it("should return inventory summary successfully", async () => {
      const mockStats = [{
        totalProducts: 10,
        totalStock: 100,
        outOfStock: 2,
        lowStock: 3,
        inStock: 5,
        totalValue: 5000
      }];

      const mockRecentOrders = [
        { _id: "prod1", productName: "Product 1", totalSold: 5 }
      ];

      Product.aggregate.mockResolvedValue(mockStats);
      Order.aggregate.mockResolvedValue(mockRecentOrders);

      await getInventorySummary(mockReq, mockRes);

      expect(Product.aggregate).toHaveBeenCalled();
      expect(Order.aggregate).toHaveBeenCalled();
      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        200,
        "Inventory summary retrieved successfully",
        expect.objectContaining({
          totalProducts: 10,
          totalStock: 100,
          outOfStock: 2,
          lowStock: 3,
          inStock: 5,
          totalValue: 5000,
          recentMovements: mockRecentOrders
        })
      );
    });

    it("should handle missing seller ID", async () => {
      mockReq.user = {};

      await getInventorySummary(mockReq, mockRes);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        400,
        "Invalid seller ID",
        "INVALID_INPUT"
      );
    });
  });

  describe("updateProductStock", () => {
    it("should update product stock successfully", async () => {
      mockReq.params.productId = "prod123";
      mockReq.body = { stock: 50, reason: "Restocked" };

      const mockProduct = {
        _id: "prod123",
        name: "Test Product",
        sku: "TEST123",
        stock: 50,
        seller: "seller123"
      };

      Product.findOneAndUpdate.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProduct)
      });

      await updateProductStock(mockReq, mockRes);

      expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "prod123", seller: "seller123" },
        { stock: 50, updatedAt: expect.any(Date) },
        { new: true }
      );
      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        200,
        "Product stock updated successfully",
        expect.objectContaining({
          product: expect.objectContaining({
            _id: "prod123",
            name: "Test Product",
            sku: "TEST123",
            stock: 50,
            stockStatus: "in_stock"
          })
        })
      );
    });

    it("should handle missing product ID", async () => {
      mockReq.params = {};
      mockReq.body = { stock: 50 };

      await updateProductStock(mockReq, mockRes);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        400,
        "Product ID is required",
        "INVALID_INPUT"
      );
    });

    it("should handle invalid stock quantity", async () => {
      mockReq.params.productId = "prod123";
      mockReq.body = { stock: -5 };

      await updateProductStock(mockReq, mockRes);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        400,
        "Valid stock quantity is required",
        "INVALID_INPUT"
      );
    });

    it("should handle product not found", async () => {
      mockReq.params.productId = "prod123";
      mockReq.body = { stock: 50 };

      Product.findOneAndUpdate.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      await updateProductStock(mockReq, mockRes);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        404,
        "Product not found or access denied",
        "RESOURCE_NOT_FOUND"
      );
    });
  });

  describe("getStockMovementHistory", () => {
    it("should return stock movement history successfully", async () => {
      mockReq.query = { days: "30" };
      const mockMovements = [
        { _id: { productId: "prod1", date: "2024-01-01" }, productName: "Product 1", quantitySold: 5 }
      ];

      Order.aggregate.mockResolvedValue(mockMovements);

      await getStockMovementHistory(mockReq, mockRes);

      expect(Order.aggregate).toHaveBeenCalled();
      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        200,
        "Stock movement history retrieved successfully",
        expect.objectContaining({
          movements: mockMovements,
          period: "30 days",
          productId: "all"
        })
      );
    });

    it("should handle specific product ID", async () => {
      mockReq.query = { productId: "prod123", days: "7" };

      Order.aggregate.mockResolvedValue([]);

      await getStockMovementHistory(mockReq, mockRes);

      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        200,
        "Stock movement history retrieved successfully",
        expect.objectContaining({
          productId: "prod123",
          period: "7 days"
        })
      );
    });
  });

  describe("getInventoryAlerts", () => {
    it("should return inventory alerts successfully", async () => {
      const mockOutOfStock = [{ _id: "prod1", name: "Product 1", stock: 0 }];
      const mockLowStock = [{ _id: "prod2", name: "Product 2", stock: 5 }];
      const mockPotentialStockouts = [{ _id: "prod3", productName: "Product 3", daysUntilStockout: 3 }];

      Product.find.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(mockOutOfStock)
        })
      }).mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(mockLowStock)
        })
      });

      Order.aggregate.mockResolvedValue(mockPotentialStockouts);

      await getInventoryAlerts(mockReq, mockRes);

      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        200,
        "Inventory alerts retrieved successfully",
        expect.objectContaining({
          outOfStock: mockOutOfStock,
          lowStock: mockLowStock,
          potentialStockouts: mockPotentialStockouts,
          alertCount: 3
        })
      );
    });

    it("should handle missing seller ID", async () => {
      mockReq.user = {};

      await getInventoryAlerts(mockReq, mockRes);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        400,
        "Invalid seller ID",
        "INVALID_INPUT"
      );
    });
  });
});
