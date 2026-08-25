// Unit tests for Tax & Shipping Integration Engine

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
jest.mock('../../models/ShippingZone');
jest.mock('../../models/FlatShippingRule');
jest.mock('../../models/FreeShippingRule');
jest.mock('../../models/WeightClass');
jest.mock('../../models/location/State');
jest.mock('../../models/location/Country');
jest.mock('../../models/coupon');

const Tax = require('../../models/Tax');
const ShippingZone = require('../../models/ShippingZone');
const FlatShippingRule = require('../../models/FlatShippingRule');
const FreeShippingRule = require('../../models/FreeShippingRule');
const WeightClass = require('../../models/WeightClass');
const State = require('../../models/location/State');
const Country = require('../../models/location/Country');
const Coupon = require('../../models/coupon');

describe('Tax & Shipping Integration Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default mock implementations
    Tax.find.mockResolvedValue([]);
    Tax.findOne.mockResolvedValue(null);
    ShippingZone.findOne.mockResolvedValue(null);
    FlatShippingRule.findOne.mockResolvedValue(null);
    WeightClass.findOne.mockResolvedValue(null);
    State.findById.mockResolvedValue(null);
    Country.findById.mockResolvedValue(null);
    Coupon.findOne.mockResolvedValue(null);
    FreeShippingRule.find.mockResolvedValue([]);
  });

  describe('calculateTax', () => {
    test('should calculate tax with default rate when no address provided', async () => {
      const result = await calculateTax(1000, null);
      
      expect(result.amount).toBe(50); // 5% of 1000
      expect(result.rate).toBe(5); // Percentage format (5 for 5%)
      expect(result.name).toBe('GST');
      expect(result.breakdown.source).toBe('default');
    });

    test('should calculate tax with state-specific rate', async () => {
      const mockState = { _id: 'state1', name: 'Delhi', populate: jest.fn().mockResolvedValue({ _id: 'state1', name: 'Delhi' }) };
      const mockTax = { _id: 'tax1', name: 'Delhi GST', percentage: 6 };
      
      // Mock State.findById().populate() chain
      const mockStateChain = {
        populate: jest.fn().mockResolvedValue(mockState)
      };
      State.findById.mockReturnValue(mockStateChain);
      Tax.findOne.mockResolvedValue(mockTax);

      const shippingAddress = { stateId: 'state1' };
      const result = await calculateTax(1000, shippingAddress);
      
      expect(result.amount).toBe(60); // 6% of 1000
      expect(result.rate).toBe(6); // Percentage format (6 for 6%)
      expect(result.name).toBe('Delhi GST');
      expect(result.breakdown.source).toBe('database');
      expect(result.breakdown.state).toBe('Delhi');
    });

    test('should calculate tax with country-specific rate', async () => {
      const mockCountry = { _id: 'country1', name: 'India' };
      const mockTax = { _id: 'tax1', name: 'India GST', percentage: 5 };
      
      Country.findById.mockResolvedValue(mockCountry);
      Tax.findOne.mockResolvedValue(mockTax);

      const shippingAddress = { countryId: 'country1' };
      const result = await calculateTax(1000, shippingAddress);
      
      expect(result.amount).toBe(50); // 5% of 1000
      expect(result.rate).toBe(5); // Percentage format (5 for 5%)
      expect(result.name).toBe('India GST');
      expect(result.breakdown.source).toBe('database');
      expect(result.breakdown.country).toBe('India');
    });

    test('should handle tax calculation errors gracefully', async () => {
      State.findById.mockRejectedValue(new Error('Database error'));

      const shippingAddress = { stateId: 'invalid' };
      const result = await calculateTax(1000, shippingAddress);
      
      expect(result.amount).toBe(50); // Fallback to default
      expect(result.rate).toBe(5); // Percentage format (5 for 5%)
      expect(result.breakdown.source).toBe('fallback');
    });

    test('should handle zero taxable amount', async () => {
      const result = await calculateTax(0, null);
      
      expect(result.amount).toBe(0);
      expect(result.rate).toBe(5); // Percentage format (5 for 5%)
    });

    test('should handle negative taxable amount', async () => {
      const result = await calculateTax(-100, null);
      
      expect(result.amount).toBe(-5); // 5% of -100
      expect(result.rate).toBe(5); // Percentage format (5 for 5%)
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

    test('should calculate shipping with zone-based flat rule', async () => {
      const mockState = { _id: 'state1', name: 'Delhi' };
      const mockZone = { _id: 'zone1', code: 'METRO', name: 'Metro' };
      const mockWeightClass = { 
        _id: 'wc1', 
        name: 'Light (0-5kg)', 
        minWeightG: 0, 
        maxWeightG: 5000 
      };
      const mockFlatRule = {
        _id: 'rule1',
        zone: mockZone,
        weightClass: mockWeightClass,
        rateINR: 100,
        label: 'Express Shipping'
      };
      
      State.findById.mockResolvedValue(mockState);
      ShippingZone.findOne.mockResolvedValue(mockZone);
      // Mock WeightClass chain (findOne().sort().lean())
      const mockWeightClassChain = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockWeightClass)
      };
      WeightClass.findOne.mockReturnValue(mockWeightClassChain);
      // Mock FlatShippingRule chain (findOne().populate().lean())
      const mockFlatRuleWithPopulate = {
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockFlatRule)
      };
      FlatShippingRule.findOne.mockReturnValue(mockFlatRuleWithPopulate);

      const cartItems = [{ product: { price: 100, weight: 1 }, quantity: 1 }];
      const shippingAddress = { stateId: 'state1', pincode: '110001' };
      const result = await calculateShipping({ cartItems, shippingAddress });
      
      expect(result.amount).toBe(100);
      expect(result.method).toBe('flat');
      expect(result.label).toContain('Express Shipping');
      expect(result.breakdown.zone).toBe('METRO');
    });

    test('should apply free shipping with coupon', async () => {
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
      expect(result.label).toContain('Free Shipping');
      expect(result.breakdown.reason).toBe('coupon_free_shipping');
    });

    test('should apply free shipping with order amount rule', async () => {
      const mockState = { _id: 'state1', name: 'Delhi' };
      const mockZone = { _id: 'zone1', code: 'METRO' };
      const mockRule = { 
        _id: 'rule1',
        name: 'Free Shipping Above 999', 
        minOrderAmountINR: 999,
        allZones: true
      };
      
      State.findById.mockResolvedValue(mockState);
      ShippingZone.findOne.mockResolvedValue(mockZone);
      // Mock FreeShippingRule chain (find().sort())
      const mockFreeRuleChain = {
        sort: jest.fn().mockResolvedValue([mockRule])
      };
      FreeShippingRule.find.mockReturnValue(mockFreeRuleChain);

      const cartItems = [{ product: { price: 1000 }, quantity: 1 }];
      const shippingAddress = { stateId: 'state1' };
      const result = await calculateShipping({ cartItems, shippingAddress });
      
      expect(result.amount).toBe(0);
      expect(result.method).toBe('free');
      expect(result.label).toContain('Free Shipping');
      expect(result.breakdown.reason).toBe('min_amount');
    });

    test('should calculate weight-based shipping', async () => {
      const mockZone = { _id: 'zone1', code: 'METRO' };
      const mockWeightClass = { 
        _id: 'wc1', 
        name: 'Medium (5-10kg)', 
        minWeightG: 5000, 
        maxWeightG: 10000 
      };
      const mockFlatRule = {
        _id: 'rule1',
        zone: mockZone,
        weightClass: mockWeightClass,
        rateINR: 50,
        label: 'Standard Shipping'
      };
      
      ShippingZone.findOne.mockResolvedValue(mockZone);
      const mockWeightClassChain = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockWeightClass)
      };
      WeightClass.findOne.mockReturnValue(mockWeightClassChain);
      const mockFlatRuleChain = {
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockFlatRule)
      };
      FlatShippingRule.findOne.mockReturnValue(mockFlatRuleChain);
      
      const cartItems = [
        { product: { price: 100, weight: 2 }, quantity: 1 },
        { product: { price: 200, weight: 3 }, quantity: 2 }
      ];
      const shippingAddress = { stateId: 'state1' };
      const result = await calculateShipping({ cartItems, shippingAddress });
      
      // Total weight should be in breakdown (8kg = 8000g)
      expect(result.breakdown.totalWeightG).toBe(8000); // (2*1) + (3*2) = 8kg = 8000g
    });

    test('should handle shipping calculation errors gracefully', async () => {
      ShippingZone.findOne.mockRejectedValue(new Error('Database error'));

      const cartItems = [{ product: { price: 100 }, quantity: 1 }];
      const shippingAddress = { stateId: 'state1' };
      const result = await calculateShipping({ cartItems, shippingAddress });
      
      expect(result.amount).toBe(50); // Fallback
      expect(result.method).toBe('fallback');
      expect(result.breakdown.source).toBe('error_fallback');
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

    test('should find zone by country', async () => {
      const mockCountry = { _id: 'country1', name: 'India', code: 'IN' };
      const mockZone = { _id: 'zone1', name: 'India Zone' };
      
      Country.findById.mockResolvedValue(mockCountry);
      ShippingZone.findOne.mockResolvedValue(mockZone);

      const address = { countryId: 'country1' };
      const result = await getShippingZoneForAddress(address);
      
      expect(result).toEqual(mockZone);
      expect(ShippingZone.findOne).toHaveBeenCalledWith({
        active: true,
        country: 'IN'
      });
    });

    test('should find zone by pincode prefix', async () => {
      const mockZone = { _id: 'zone1', name: 'Delhi Zone' };
      
      ShippingZone.findOne.mockResolvedValue(mockZone);

      const address = { pincode: '110001' };
      const result = await getShippingZoneForAddress(address);
      
      expect(result).toEqual(mockZone);
      expect(ShippingZone.findOne).toHaveBeenCalledWith({
        active: true,
        pinPrefixes: { $in: ['110'] }
      });
    });

    test('should return null when no zone found', async () => {
      State.findById.mockResolvedValue(null);
      ShippingZone.findOne.mockResolvedValue(null);

      const address = { stateId: 'invalid' };
      const result = await getShippingZoneForAddress(address);
      
      expect(result).toBeNull();
    });

    test('should handle errors gracefully', async () => {
      State.findById.mockRejectedValue(new Error('Database error'));

      const address = { stateId: 'state1' };
      const result = await getShippingZoneForAddress(address);
      
      expect(result).toBeNull();
    });
  });

  describe('checkFreeShippingRules', () => {
    test('should return free shipping for qualifying order amount', async () => {
      const mockZone = { _id: 'zone1' };
      const mockRule = { 
        _id: 'rule1',
        name: 'Free Shipping Above 999', 
        minOrderAmountINR: 999,
        allZones: true
      };
      
      // Mock FreeShippingRule.find().sort() chain
      const mockFreeRuleChain = {
        sort: jest.fn().mockResolvedValue([mockRule])
      };
      FreeShippingRule.find.mockReturnValue(mockFreeRuleChain);

      const cartItems = [{ product: { price: 1000 }, quantity: 1 }];
      const result = await checkFreeShippingRules({ cartItems, shippingZone: mockZone });
      
      expect(result.isFree).toBe(true);
      expect(result.reason).toContain('Free shipping on orders above ₹999');
    });

    test('should not return free shipping for non-qualifying order amount', async () => {
      const mockZone = { _id: 'zone1' };
      const mockRule = { 
        _id: 'rule1',
        name: 'Free Shipping Above 999', 
        minOrderAmountINR: 999,
        allZones: true
      };
      
      // Mock FreeShippingRule.find().sort() chain
      const mockFreeRuleChain = {
        sort: jest.fn().mockResolvedValue([mockRule])
      };
      FreeShippingRule.find.mockReturnValue(mockFreeRuleChain);

      const cartItems = [{ product: { price: 500 }, quantity: 1 }];
      const result = await checkFreeShippingRules({ cartItems, shippingZone: mockZone });
      
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

    test('should handle errors gracefully', async () => {
      FreeShippingRule.find.mockRejectedValue(new Error('Database error'));

      const cartItems = [{ product: { price: 1000 }, quantity: 1 }];
      const result = await checkFreeShippingRules({ cartItems });
      
      expect(result.isFree).toBe(false);
      expect(result.reason).toBe('Error checking free shipping rules');
    });
  });

  describe('getAvailableShippingMethods', () => {
    test('should return unavailable methods (cost null) when no address/zone', async () => {
      const mockWeightClasses = [
        { _id: 'wc1', name: 'Light (0-5kg)', minWeightG: 0, maxWeightG: 5000 }
      ];

      const mockFindChain = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockWeightClasses),
      };
      WeightClass.find.mockReturnValue(mockFindChain);

      const result = await getAvailableShippingMethods(null);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].cost).toBeNull();
      expect(result[0].available).toBe(false);
    });

    test('should return zone-specific methods', async () => {
      const mockState = { _id: 'state1', name: 'Delhi' };
      const mockZone = { _id: 'zone1', code: 'METRO', name: 'Metro' };
      const mockWeightClass = {
        _id: 'wc1',
        name: 'Light (0-5kg)',
        minWeightG: 0,
        maxWeightG: 5000
      };
      const mockFlatRule = {
        _id: 'rule1',
        weightClass: mockWeightClass,
        rateINR: 100,
        label: 'Express Shipping'
      };

      State.findById.mockResolvedValue(mockState);
      ShippingZone.findOne.mockResolvedValue(mockZone);

      const mockWeightClassChain = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockWeightClass]),
      };
      WeightClass.find.mockReturnValue(mockWeightClassChain);

      const mockFlatRuleFindChain = {
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockFlatRule])
      };
      FlatShippingRule.find.mockReturnValue(mockFlatRuleFindChain);

      const shippingAddress = { stateId: 'state1' };
      const result = await getAvailableShippingMethods(shippingAddress);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].cost).toBe(100);
      expect(result[0].available).toBe(true);
    });

    test('should return unavailable methods when no zone found (no ₹50 default)', async () => {
      const mockWeightClasses = [
        { _id: 'wc1', name: 'Light (0-5kg)', minWeightG: 0, maxWeightG: 5000 }
      ];

      ShippingZone.findOne.mockResolvedValue(null);
      const mockWeightClassChain = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockWeightClasses),
      };
      WeightClass.find.mockReturnValue(mockWeightClassChain);
      FlatShippingRule.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const shippingAddress = { stateId: 'invalid' };
      const result = await getAvailableShippingMethods(shippingAddress);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].cost).toBeNull();
      expect(result[0].available).toBe(false);
    });

    test('should handle errors gracefully', async () => {
      WeightClass.find.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await getAvailableShippingMethods(null);

      expect(result).toEqual([]);
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

    test('should return country-specific tax rates', async () => {
      const mockCountry = { _id: 'country1', name: 'India' };
      const mockTaxes = [
        { _id: 'tax1', name: 'India GST', percentage: 5 }
      ];
      
      Country.findById.mockResolvedValue(mockCountry);
      Tax.find.mockResolvedValue(mockTaxes);

      const shippingAddress = { countryId: 'country1' };
      const result = await getTaxRatesForLocation(shippingAddress);
      
      expect(result).toEqual(mockTaxes);
      expect(Tax.find).toHaveBeenCalledWith({
        name: { $regex: /India/i }
      });
    });

    test('should return all rates when no specific rates found', async () => {
      const mockTaxes = [
        { _id: 'tax1', name: 'GST', percentage: 5 }
      ];
      
      State.findById.mockResolvedValue(null);
      Tax.find.mockResolvedValue(mockTaxes);

      const shippingAddress = { stateId: 'invalid' };
      const result = await getTaxRatesForLocation(shippingAddress);
      
      expect(result).toEqual(mockTaxes);
    });

    test('should handle errors gracefully', async () => {
      State.findById.mockRejectedValue(new Error('Database error'));

      const shippingAddress = { stateId: 'state1' };
      const result = await getTaxRatesForLocation(shippingAddress);
      
      expect(result).toEqual([]);
    });
  });
});
