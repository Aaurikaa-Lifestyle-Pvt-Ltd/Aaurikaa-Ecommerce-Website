const { calculateOrderCommission } = require('../../utils/calculateCommission');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');

// Mock the models
jest.mock('../../models/Order');
jest.mock('../../models/Product');
jest.mock('../../models/Seller');

describe('Commission Integration with Orders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateOrderCommission', () => {
    it('should calculate commission for order with multiple products from different sellers', async () => {
      const mockOrder = {
        _id: 'order123',
        items: [
          {
            product: {
              _id: 'product1',
              seller: 'seller1',
              category: 'category1',
              price: 100
            },
            quantity: 2
          },
          {
            product: {
              _id: 'product2',
              seller: 'seller2',
              category: 'category2',
              price: 200
            },
            quantity: 1
          }
        ]
      };

      const mockSeller1 = {
        _id: 'seller1',
        commission: 10,
        categoryCommission: []
      };

      const mockSeller2 = {
        _id: 'seller2',
        commission: 15,
        categoryCommission: []
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      Seller.findById = jest.fn()
        .mockResolvedValueOnce(mockSeller1)
        .mockResolvedValueOnce(mockSeller2);

      const result = await calculateOrderCommission('order123');

      expect(result).toHaveLength(2);
      expect(result[0].sellerId).toBe('seller1');
      expect(result[0].totalAmount).toBe(20); // 10% of 200
      expect(result[1].sellerId).toBe('seller2');
      expect(result[1].totalAmount).toBe(30); // 15% of 200
    });

    it('should calculate commission for order with products from same seller', async () => {
      const mockOrder = {
        _id: 'order123',
        items: [
          {
            product: {
              _id: 'product1',
              seller: 'seller1',
              category: 'category1',
              price: 100
            },
            quantity: 2
          },
          {
            product: {
              _id: 'product2',
              seller: 'seller1',
              category: 'category2',
              price: 200
            },
            quantity: 1
          }
        ]
      };

      const mockSeller = {
        _id: 'seller1',
        commission: 10,
        categoryCommission: []
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      Seller.findById = jest.fn().mockResolvedValue(mockSeller);

      const result = await calculateOrderCommission('order123');

      expect(result).toHaveLength(1);
      expect(result[0].sellerId).toBe('seller1');
      expect(result[0].totalAmount).toBe(40); // 10% of (200 + 200)
      expect(result[0].items).toHaveLength(2);
    });

    it('should return empty array when order is not found', async () => {
      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      const result = await calculateOrderCommission('order123');

      expect(result).toEqual([]);
    });

    it('should skip items without product details', async () => {
      const mockOrder = {
        _id: 'order123',
        items: [
          {
            product: null, // Missing product
            quantity: 2
          },
          {
            product: {
              _id: 'product2',
              seller: 'seller1',
              category: 'category1',
              price: 100
            },
            quantity: 1
          }
        ]
      };

      const mockSeller = {
        _id: 'seller1',
        commission: 10,
        categoryCommission: []
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      Seller.findById = jest.fn().mockResolvedValue(mockSeller);

      const result = await calculateOrderCommission('order123');

      expect(result).toHaveLength(1);
      expect(result[0].items).toHaveLength(1);
    });

    it('should skip items without seller information', async () => {
      const mockOrder = {
        _id: 'order123',
        items: [
          {
            product: {
              _id: 'product1',
              seller: null, // Missing seller
              category: 'category1',
              price: 100
            },
            quantity: 2
          }
        ]
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      const result = await calculateOrderCommission('order123');

      expect(result).toEqual([]);
    });

    it('should handle calculation errors gracefully', async () => {
      const mockOrder = {
        _id: 'order123',
        items: [
          {
            product: {
              _id: 'product1',
              seller: 'seller1',
              category: 'category1',
              price: 100
            },
            quantity: 2
          }
        ]
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      Seller.findById = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await calculateOrderCommission('order123');

      expect(result).toEqual([]);
    });

    it('should calculate commission with category-specific rates', async () => {
      const mockOrder = {
        _id: 'order123',
        items: [
          {
            product: {
              _id: 'product1',
              seller: 'seller1',
              category: 'category1',
              price: 100
            },
            quantity: 2
          }
        ]
      };

      const mockSeller = {
        _id: 'seller1',
        commission: 10,
        categoryCommission: [
          { categoryId: 'category1', commission: 15 }
        ]
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      Seller.findById = jest.fn().mockResolvedValue(mockSeller);

      const result = await calculateOrderCommission('order123');

      expect(result).toHaveLength(1);
      expect(result[0].totalAmount).toBe(30); // 15% of 200
    });

    it('should include all item details in commission breakdown', async () => {
      const mockOrder = {
        _id: 'order123',
        items: [
          {
            product: {
              _id: 'product1',
              seller: 'seller1',
              category: 'category1',
              price: 100
            },
            quantity: 2
          }
        ]
      };

      const mockSeller = {
        _id: 'seller1',
        commission: 10,
        categoryCommission: []
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      Seller.findById = jest.fn().mockResolvedValue(mockSeller);

      const result = await calculateOrderCommission('order123');

      expect(result[0].items[0]).toHaveProperty('productId');
      expect(result[0].items[0]).toHaveProperty('categoryId');
      expect(result[0].items[0]).toHaveProperty('quantity');
      expect(result[0].items[0]).toHaveProperty('price');
      expect(result[0].items[0]).toHaveProperty('commissionAmount');
      expect(result[0].items[0].productId).toBe('product1');
      expect(result[0].items[0].quantity).toBe(2);
    });

    it('should aggregate commission for multiple items from same seller and category', async () => {
      const mockOrder = {
        _id: 'order123',
        items: [
          {
            product: {
              _id: 'product1',
              seller: 'seller1',
              category: 'category1',
              price: 100
            },
            quantity: 1
          },
          {
            product: {
              _id: 'product2',
              seller: 'seller1',
              category: 'category1',
              price: 150
            },
            quantity: 1
          }
        ]
      };

      const mockSeller = {
        _id: 'seller1',
        commission: 10,
        categoryCommission: []
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      Seller.findById = jest.fn().mockResolvedValue(mockSeller);

      const result = await calculateOrderCommission('order123');

      expect(result).toHaveLength(1);
      expect(result[0].totalAmount).toBe(25); // 10% of (100 + 150)
      expect(result[0].items).toHaveLength(2);
    });
  });
});

