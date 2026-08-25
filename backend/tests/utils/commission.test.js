const {
  calculateCommission,
  calculateBulkCommission,
  getCommissionRate,
  calculateOrderCommission,
  validateCommissionConfig,
  getSellerCommissionSummary
} = require('../../utils/calculateCommission');

const Seller = require('../../models/Seller');
const Category = require('../../models/Category');
const Order = require('../../models/Order');
const Commission = require('../../models/Commission');

// Mock the models
jest.mock('../../models/Seller');
jest.mock('../../models/Category');
jest.mock('../../models/Order');
jest.mock('../../models/Commission');

describe('Commission Calculation Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateCommission', () => {
    it('should calculate commission correctly with category-specific rate', async () => {
      const mockSeller = {
        _id: 'seller123',
        commission: 10,
        categoryCommission: [
          { categoryId: 'category1', commission: 15 }
        ]
      };

      Seller.findById.mockResolvedValue(mockSeller);

      const result = await calculateCommission('seller123', 'category1', 1000);

      expect(result).toBe(150); // 15% of 1000
      expect(Seller.findById).toHaveBeenCalledWith('seller123');
    });

    it('should use default seller commission rate when no category-specific rate exists', async () => {
      const mockSeller = {
        _id: 'seller123',
        commission: 10,
        categoryCommission: []
      };

      Seller.findById.mockResolvedValue(mockSeller);

      const result = await calculateCommission('seller123', 'category2', 1000);

      expect(result).toBe(100); // 10% of 1000
    });

    it('should use system default rate (5%) when seller has no commission rate', async () => {
      const mockSeller = {
        _id: 'seller123',
        categoryCommission: []
      };

      Seller.findById.mockResolvedValue(mockSeller);

      const result = await calculateCommission('seller123', 'category3', 1000);

      expect(result).toBe(50); // 5% of 1000
    });

    it('should throw error when seller ID is missing', async () => {
      await expect(calculateCommission(null, 'category1', 1000))
        .rejects.toThrow('Seller ID is required for commission calculation');
    });

    it('should throw error when category ID is missing', async () => {
      await expect(calculateCommission('seller123', null, 1000))
        .rejects.toThrow('Category ID is required for commission calculation');
    });

    it('should throw error when price is invalid', async () => {
      await expect(calculateCommission('seller123', 'category1', -100))
        .rejects.toThrow('Price must be a positive number');

      await expect(calculateCommission('seller123', 'category1', 'invalid'))
        .rejects.toThrow('Price must be a positive number');
    });

    it('should throw error when seller is not found', async () => {
      Seller.findById.mockResolvedValue(null);

      await expect(calculateCommission('seller123', 'category1', 1000))
        .rejects.toThrow('Seller not found');
    });

    it('should round commission amount to 2 decimal places', async () => {
      const mockSeller = {
        _id: 'seller123',
        commission: 13.33 // Rate that creates decimal commission
      };

      Seller.findById.mockResolvedValue(mockSeller);

      const result = await calculateCommission('seller123', 'category1', 1000);

      expect(result).toBe(133.3); // Rounded properly
    });

    it('should throw error for invalid commission rate (over 100)', async () => {
      const mockSeller = {
        _id: 'seller123',
        commission: 150 // Invalid rate over 100%
      };

      Seller.findById.mockResolvedValue(mockSeller);

      await expect(calculateCommission('seller123', 'category1', 1000))
        .rejects.toThrow('Commission rate must be between 0 and 100');
    });

    it('should throw error for invalid commission rate (negative)', async () => {
      const mockSeller = {
        _id: 'seller123',
        commission: -10 // Invalid negative rate
      };

      Seller.findById.mockResolvedValue(mockSeller);

      await expect(calculateCommission('seller123', 'category1', 1000))
        .rejects.toThrow('Commission rate must be between 0 and 100');
    });
  });

  describe('calculateBulkCommission', () => {
    it('should calculate commission for multiple items correctly', async () => {
      const mockSeller = {
        _id: 'seller123',
        commission: 10,
        categoryCommission: [
          { categoryId: 'category1', commission: 15 },
          { categoryId: 'category2', commission: 12 }
        ]
      };

      Seller.findById.mockResolvedValue(mockSeller);

      const items = [
        { categoryId: 'category1', price: 100, quantity: 2 },
        { categoryId: 'category2', price: 200, quantity: 1 }
      ];

      const result = await calculateBulkCommission('seller123', items);

      expect(result).toHaveLength(2);
      expect(result[0].commissionAmount).toBe(30); // 15% of (100 * 2)
      expect(result[1].commissionAmount).toBe(24); // 12% of (200 * 1)
    });

    it('should throw error when seller ID is missing', async () => {
      const items = [{ categoryId: 'category1', price: 100, quantity: 1 }];

      await expect(calculateBulkCommission(null, items))
        .rejects.toThrow('Seller ID is required for bulk commission calculation');
    });

    it('should throw error when items array is empty', async () => {
      await expect(calculateBulkCommission('seller123', []))
        .rejects.toThrow('Items array is required and must not be empty');
    });

    it('should throw error when items is not an array', async () => {
      await expect(calculateBulkCommission('seller123', 'invalid'))
        .rejects.toThrow('Items array is required and must not be empty');
    });

    it('should throw error when seller is not found', async () => {
      Seller.findById.mockResolvedValue(null);

      const items = [{ categoryId: 'category1', price: 100, quantity: 1 }];

      await expect(calculateBulkCommission('seller123', items))
        .rejects.toThrow('Seller not found');
    });

    it('should throw error when item is missing categoryId', async () => {
      const mockSeller = { _id: 'seller123', commission: 10 };
      Seller.findById.mockResolvedValue(mockSeller);

      const items = [{ price: 100, quantity: 1 }]; // Missing categoryId

      await expect(calculateBulkCommission('seller123', items))
        .rejects.toThrow('Category ID is required for each item');
    });

    it('should throw error when item has invalid price', async () => {
      const mockSeller = { _id: 'seller123', commission: 10 };
      Seller.findById.mockResolvedValue(mockSeller);

      const items = [{ categoryId: 'category1', price: -100, quantity: 1 }];

      await expect(calculateBulkCommission('seller123', items))
        .rejects.toThrow('Price must be a positive number for each item');
    });

    it('should throw error when item has invalid quantity', async () => {
      const mockSeller = { _id: 'seller123', commission: 10 };
      Seller.findById.mockResolvedValue(mockSeller);

      const items = [{ categoryId: 'category1', price: 100, quantity: -1 }];

      await expect(calculateBulkCommission('seller123', items))
        .rejects.toThrow('Quantity must be a positive number for each item');
    });
  });

  describe('getCommissionRate', () => {
    it('should return category-specific commission rate', async () => {
      const mockSeller = {
        _id: 'seller123',
        commission: 10,
        categoryCommission: [
          { categoryId: 'category1', commission: 15 }
        ]
      };

      Seller.findById.mockResolvedValue(mockSeller);

      const result = await getCommissionRate('seller123', 'category1');

      expect(result).toBe(15);
    });

    it('should return seller default rate when no category-specific rate exists', async () => {
      const mockSeller = {
        _id: 'seller123',
        commission: 10,
        categoryCommission: []
      };

      Seller.findById.mockResolvedValue(mockSeller);

      const result = await getCommissionRate('seller123', 'category2');

      expect(result).toBe(10);
    });

    it('should return system default rate (5%) when seller has no commission rate', async () => {
      const mockSeller = {
        _id: 'seller123',
        categoryCommission: []
      };

      Seller.findById.mockResolvedValue(mockSeller);

      const result = await getCommissionRate('seller123', 'category3');

      expect(result).toBe(5);
    });

    it('should return default rate (5%) when seller is not found', async () => {
      Seller.findById.mockResolvedValue(null);

      const result = await getCommissionRate('seller123', 'category1');

      expect(result).toBe(5);
    });

    it('should return default rate (5%) when rate is invalid', async () => {
      const mockSeller = {
        _id: 'seller123',
        commission: 150 // Invalid rate
      };

      Seller.findById.mockResolvedValue(mockSeller);

      const result = await getCommissionRate('seller123', 'category1');

      expect(result).toBe(5);
    });

    it('should return default rate (5%) on error', async () => {
      Seller.findById.mockRejectedValue(new Error('Database error'));

      const result = await getCommissionRate('seller123', 'category1');

      expect(result).toBe(5);
    });
  });

  describe('validateCommissionConfig', () => {
    it('should validate correct commission configuration', async () => {
      const mockSeller = { _id: 'seller123' };
      const mockCategory = { _id: 'category1' };

      Seller.findById.mockResolvedValue(mockSeller);
      Category.findById.mockResolvedValue(mockCategory);

      const result = await validateCommissionConfig('seller123', 'category1', 15);

      expect(result.valid).toBe(true);
    });

    it('should return error when seller is not found', async () => {
      Seller.findById.mockResolvedValue(null);

      const result = await validateCommissionConfig('seller123', 'category1', 15);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Seller not found');
    });

    it('should return error when category is not found', async () => {
      const mockSeller = { _id: 'seller123' };

      Seller.findById.mockResolvedValue(mockSeller);
      Category.findById.mockResolvedValue(null);

      const result = await validateCommissionConfig('seller123', 'category1', 15);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Category not found');
    });

    it('should return error when commission rate is invalid', async () => {
      const mockSeller = { _id: 'seller123' };
      const mockCategory = { _id: 'category1' };

      Seller.findById.mockResolvedValue(mockSeller);
      Category.findById.mockResolvedValue(mockCategory);

      const result = await validateCommissionConfig('seller123', 'category1', 150);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Commission rate must be between 0 and 100');
    });

    it('should return error when commission rate is negative', async () => {
      const mockSeller = { _id: 'seller123' };
      const mockCategory = { _id: 'category1' };

      Seller.findById.mockResolvedValue(mockSeller);
      Category.findById.mockResolvedValue(mockCategory);

      const result = await validateCommissionConfig('seller123', 'category1', -10);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Commission rate must be between 0 and 100');
    });
  });

  describe('getSellerCommissionSummary', () => {
    it('should return commission summary for seller', async () => {
      const mockSummary = [
        { _id: 'pending', count: 5, totalAmount: 500, totalOrderAmount: 5000 },
        { _id: 'approved', count: 10, totalAmount: 1000, totalOrderAmount: 10000 },
        { _id: 'paid', count: 20, totalAmount: 2000, totalOrderAmount: 20000 }
      ];

      Commission.aggregate = jest.fn().mockResolvedValue(mockSummary);

      const result = await getSellerCommissionSummary('seller123');

      expect(result).toEqual(mockSummary);
      expect(Commission.aggregate).toHaveBeenCalled();
    });

    it('should filter by date range when provided', async () => {
      Commission.aggregate = jest.fn().mockResolvedValue([]);

      const startDate = '2024-01-01';
      const endDate = '2024-12-31';

      await getSellerCommissionSummary('seller123', startDate, endDate);

      const aggregateCall = Commission.aggregate.mock.calls[0][0];
      expect(aggregateCall[0].$match.createdAt).toBeDefined();
    });

    it('should return empty array on error', async () => {
      Commission.aggregate = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await getSellerCommissionSummary('seller123');

      expect(result).toEqual([]);
    });
  });
});

