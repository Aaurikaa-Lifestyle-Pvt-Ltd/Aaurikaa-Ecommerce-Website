// Simplified unit tests for Tax & Shipping Integration Engine

const {
  calculateTax,
  calculateShipping,
  getShippingZoneForAddress,
  checkFreeShippingRules,
  getAvailableShippingMethods,
  getTaxRatesForLocation
} = require('../../utils/taxShippingEngine');

// Mock the models
jest.mock('../../models/Tax');
jest.mock('../../models/ShippingMethod');
jest.mock('../../models/ShippingZone');
jest.mock('../../models/FlatShippingRule');
jest.mock('../../models/FreeShippingRule');
jest.mock('../../models/location/State');
jest.mock('../../models/location/Country');
jest.mock('../../models/coupon');

const Tax = require('../../models/Tax');
const ShippingMethod = require('../../models/ShippingMethod');
const ShippingZone = require('../../models/ShippingZone');
const FlatShippingRule = require('../../models/FlatShippingRule');
const FreeShippingRule = require('../../models/FreeShippingRule');
const State = require('../../models/location/State');
const Country = require('../../models/location/Country');
const Coupon = require('../../models/coupon');

describe('Tax & Shipping Integration Engine - Simplified Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default mock implementations
    Tax.find.mockResolvedValue([]);
    Tax.findOne.mockResolvedValue(null);
    ShippingMethod.find.mockResolvedValue([]);
    ShippingMethod.getMethodsForZone.mockResolvedValue([]);
    ShippingZone.findOne.mockResolvedValue(null);
    State.findById.mockResolvedValue(null);
    Country.findById.mockResolvedValue(null);
    Coupon.findOne.mockResolvedValue(null);
    FreeShippingRule.find.mockResolvedValue([]);
  });

  describe('calculateTax', () => {
    test('should calculate tax with default rate when no address provided', async () => {
      const result = await calculateTax(1000, null);
      
      expect(result.amount).toBe(50); // 5% of 1000
      expect(result.rate).toBe(0.05);
      expect(result.name).toBe('GST');
      expect(result.breakdown.source).toBe('default');
    });

    test('should calculate tax with state-specific rate when found', async () => {
      const mockState = { _id: 'state1', name: 'Delhi' };
      const mockTax = { _id: 'tax1', name: 'Delhi GST', percentage: 6 };
      
      State.findById.mockResolvedValue(mockState);
      Tax.findOne.mockResolvedValue(mockTax);

      const shippingAddress = { stateId: 'state1' };
      const result = await calculateTax(1000, shippingAddress);
      
      expect(result.amount).toBe(60); // 6% of 1000
      expect(result.rate).toBe(0.06);
      expect(result.name).toBe('Delhi GST');
      expect(result.breakdown.source).toBe('database');
      expect(result.breakdown.state).toBe('Delhi');
    });

    test('should fallback to default when state not found', async () => {
      State.findById.mockResolvedValue(null);

      const shippingAddress = { stateId: 'invalid' };
      const result = await calculateTax(1000, shippingAddress);
      
      expect(result.amount).toBe(50); // Default 5%
      expect(result.rate).toBe(0.05);
      expect(result.name).toBe('GST');
    });

    test('should handle zero taxable amount', async () => {
      const result = await calculateTax(0, null);
      
      expect(result.amount).toBe(0);
      expect(result.rate).toBe(0.05);
    });
  });

  describe('calculateShipping', () => {
    test('should return no shipping for empty cart', async () => {
      const result = await calculateShipping({ cartItems: [] });
      
      expect(result.amount).toBe(0);
      expect(result.method).toBe('none');
      expect(result.label).toBe('No shipping required');
    });

    test('should return default shipping when no address provided', async () => {
      const cartItems = [{ product: { price: 100 }, quantity: 1 }];
      const result = await calculateShipping({ cartItems });
      
      expect(result.amount).toBe(50);
      expect(result.method).toBe('flat');
      expect(result.label).toBe('Standard Shipping');
      expect(result.breakdown.source).toBe('default');
    });

    test('should calculate shipping with zone-based method when zone found', async () => {
      const mockZone = { _id: 'zone1', name: 'Metro' };
      const mockMethod = { 
        _id: 'method1', 
        name: 'Express Shipping', 
        cost: 100,
        estimatedDays: { min: 1, max: 2 }
      };
      
      ShippingZone.findOne.mockResolvedValue(mockZone);
      ShippingMethod.getMethodsForZone.mockResolvedValue([mockMethod]);

      const cartItems = [{ product: { price: 100, weight: 1 }, quantity: 1 }];
      const shippingAddress = { stateId: 'state1', pincode: '110001' };
      const result = await calculateShipping({ cartItems, shippingAddress });
      
      expect(result.amount).toBe(100);
      expect(result.method).toBe('zone_based');
      expect(result.label).toBe('Express Shipping');
      expect(result.breakdown.source).toBe('zone_method');
      expect(result.breakdown.zone).toBe('Metro');
    });

    test('should apply free shipping with valid coupon', async () => {
      const mockCoupon = { 
        code: 'FREESHIP', 
        isActive: true, 
        freeShipping: true 
      };
      
      Coupon.findOne.mockResolvedValue(mockCoupon);

      const cartItems = [{ product: { price: 100 }, quantity: 1 }];
      const result = await calculateShipping({ 
        cartItems, 
        couponCode: 'FREESHIP' 
      });
      
      expect(result.amount).toBe(0);
      expect(result.method).toBe('free');
      expect(result.label).toBe('Free Shipping');
      expect(result.breakdown.freeShipping).toBe(true);
    });

    test('should calculate weight from cart items', async () => {
      const cartItems = [
        { product: { price: 100, weight: 2 }, quantity: 1 },
        { product: { price: 200, weight: 3 }, quantity: 2 }
      ];
      
      const result = await calculateShipping({ cartItems });
      
      expect(result.breakdown.weight).toBe(8); // (2*1) + (3*2) = 8kg
    });
  });

  describe('getShippingZoneForAddress', () => {
    test('should find zone by state', async () => {
      const mockState = { _id: 'state1', name: 'Delhi' };
      const mockZone = { _id: 'zone1', name: 'Metro Zone' };
      
      State.findById.mockResolvedValue(mockState);
      ShippingZone.findOne.mockResolvedValue(mockZone);

      const address = { stateId: 'state1' };
      const result = await getShippingZoneForAddress(address);
      
      expect(result).toEqual(mockZone);
      expect(ShippingZone.findOne).toHaveBeenCalledWith({
        active: true,
        states: { $in: ['Delhi'] }
      });
    });

    test('should return null when no zone found', async () => {
      State.findById.mockResolvedValue(null);
      ShippingZone.findOne.mockResolvedValue(null);

      const address = { stateId: 'invalid' };
      const result = await getShippingZoneForAddress(address);
      
      expect(result).toBeNull();
    });
  });

  describe('checkFreeShippingRules', () => {
    test('should return free shipping for qualifying order amount', async () => {
      const mockRule = { 
        name: 'Free Shipping Above 999', 
        minOrderAmountINR: 999 
      };
      
      FreeShippingRule.find.mockResolvedValue([mockRule]);

      const cartItems = [{ product: { price: 1000 }, quantity: 1 }];
      const result = await checkFreeShippingRules({ cartItems });
      
      expect(result.isFree).toBe(true);
      expect(result.reason).toContain('Free shipping on orders above ₹999');
    });

    test('should not return free shipping for non-qualifying order amount', async () => {
      const mockRule = { 
        name: 'Free Shipping Above 999', 
        minOrderAmountINR: 999 
      };
      
      FreeShippingRule.find.mockResolvedValue([mockRule]);

      const cartItems = [{ product: { price: 500 }, quantity: 1 }];
      const result = await checkFreeShippingRules({ cartItems });
      
      expect(result.isFree).toBe(false);
      expect(result.reason).toBe('No free shipping rules apply');
    });

    test('should return free shipping with valid coupon', async () => {
      const mockCoupon = { 
        code: 'FREESHIP', 
        isActive: true, 
        freeShipping: true 
      };
      
      Coupon.findOne.mockResolvedValue(mockCoupon);

      const cartItems = [{ product: { price: 100 }, quantity: 1 }];
      const result = await checkFreeShippingRules({ 
        cartItems, 
        couponCode: 'FREESHIP' 
      });
      
      expect(result.isFree).toBe(true);
      expect(result.reason).toContain('Free shipping with coupon FREESHIP');
    });
  });

  describe('getAvailableShippingMethods', () => {
    test('should return default methods when no address provided', async () => {
      const mockMethods = [
        { _id: 'method1', name: 'Standard Shipping', cost: 50 }
      ];
      
      ShippingMethod.find.mockResolvedValue(mockMethods);

      const result = await getAvailableShippingMethods(null);
      
      expect(result).toEqual(mockMethods);
      expect(ShippingMethod.find).toHaveBeenCalledWith({
        isActive: true,
        zones: { $size: 0 }
      });
    });

    test('should return zone-specific methods', async () => {
      const mockZone = { _id: 'zone1', name: 'Metro' };
      const mockMethods = [
        { _id: 'method1', name: 'Express Shipping', cost: 100 }
      ];
      
      ShippingMethod.getMethodsForZone.mockResolvedValue(mockMethods);

      const shippingAddress = { stateId: 'state1' };
      const result = await getAvailableShippingMethods(shippingAddress);
      
      expect(result).toEqual(mockMethods);
    });
  });

  describe('getTaxRatesForLocation', () => {
    test('should return default tax rates when no address provided', async () => {
      const mockTaxes = [
        { _id: 'tax1', name: 'GST', percentage: 5 }
      ];
      
      Tax.find.mockResolvedValue(mockTaxes);

      const result = await getTaxRatesForLocation(null);
      
      expect(result).toEqual(mockTaxes);
      expect(Tax.find).toHaveBeenCalledWith();
    });

    test('should return state-specific tax rates', async () => {
      const mockState = { _id: 'state1', name: 'Delhi' };
      const mockTaxes = [
        { _id: 'tax1', name: 'Delhi GST', percentage: 6 }
      ];
      
      State.findById.mockResolvedValue(mockState);
      Tax.find.mockResolvedValue(mockTaxes);

      const shippingAddress = { stateId: 'state1' };
      const result = await getTaxRatesForLocation(shippingAddress);
      
      expect(result).toEqual(mockTaxes);
      expect(Tax.find).toHaveBeenCalledWith({
        name: { $regex: /Delhi/i }
      });
    });
  });
});
