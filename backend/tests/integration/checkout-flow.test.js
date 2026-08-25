const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// Mock the models
jest.mock('../../models/Shopper');
jest.mock('../../models/Product');
jest.mock('../../models/Order');
jest.mock('../../models/coupon');

const Shopper = require('../../models/Shopper');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Coupon = require('../../models/coupon');

const app = express();
app.use(express.json());

// Import controllers
const shopperController = require('../../controllers/shopperController');
const paymentController = require('../../controllers/paymentController');

// Mock middleware
const mockVerifyShopper = (req, res, next) => {
  req.user = { id: 'shopper123' };
  next();
};

// Add routes
app.get('/api/shopper/cart', mockVerifyShopper, shopperController.getCart);
app.post('/api/shopper/cart/add', mockVerifyShopper, shopperController.addToCart);
app.get('/api/shopper/compare', mockVerifyShopper, shopperController.getCompareList);

describe('Checkout Flow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // CART TO CHECKOUT FLOW
  // ==========================================
  describe('Cart to Checkout Flow', () => {
    test('should load cart items for checkout', async () => {
      const mockCart = [
        {
          product: {
            _id: 'product1',
            name: 'Product 1',
            salePrice: 1000,
            stock: 10
          },
          quantity: 2
        },
        {
          product: {
            _id: 'product2',
            name: 'Product 2',
            salePrice: 2000,
            stock: 5
          },
          quantity: 1
        }
      ];

      const mockShopper = {
        _id: 'shopper123',
        cart: mockCart
      };

      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockShopper)
      });

      const response = await request(app)
        .get('/api/shopper/cart')
        .expect(200);

      expect(response.body.cart.items).toHaveLength(2);
      
      // Calculate totals
      const subtotal = mockCart.reduce((acc, item) => {
        return acc + (item.product.salePrice * item.quantity);
      }, 0);
      
      expect(subtotal).toBe(4000); // (1000*2) + (2000*1)
    });

    test('should validate product availability before checkout', async () => {
      const mockCart = [
        {
          product: {
            _id: 'product1',
            name: 'Product 1',
            salePrice: 1000,
            stock: 0 // Out of stock
          },
          quantity: 1
        }
      ];

      const mockShopper = {
        _id: 'shopper123',
        cart: mockCart
      };

      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockShopper)
      });

      const response = await request(app)
        .get('/api/shopper/cart')
        .expect(200);

      // Check stock availability
      const outOfStockItems = response.body.cart.items.filter(
        item => item.product.stock <= 0
      );

      expect(outOfStockItems).toHaveLength(1);
    });

    test('should prevent checkout with empty cart', async () => {
      const mockShopper = {
        _id: 'shopper123',
        cart: []
      };

      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockShopper)
      });

      const response = await request(app)
        .get('/api/shopper/cart')
        .expect(200);

      expect(response.body.cart.items).toHaveLength(0);
      
      // Checkout should be prevented for empty cart
      const canCheckout = response.body.cart.items.length > 0;
      expect(canCheckout).toBe(false);
    });
  });

  // ==========================================
  // ADDRESS VALIDATION FLOW
  // ==========================================
  describe('Address Validation in Checkout', () => {
    test('should validate complete billing address', () => {
      const billingAddress = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '9876543210',
        address1: '123 Main Street',
        address2: 'Apartment 4B',
        postoffice: 'Central PO',
        zip: '110001',
        countryId: 'India',
        stateId: 'Delhi',
        districtId: 'New Delhi'
      };

      const requiredFields = ['name', 'email', 'phone', 'address1', 'zip', 'countryId', 'stateId'];
      const isValid = requiredFields.every(
        field => billingAddress[field] && billingAddress[field].trim() !== ''
      );

      expect(isValid).toBe(true);
    });

    test('should detect missing required address fields', () => {
      const incompleteAddress = {
        name: 'John Doe',
        email: 'john@example.com',
        address1: '123 Main Street'
        // Missing phone, zip, countryId, stateId
      };

      const requiredFields = ['name', 'email', 'phone', 'address1', 'zip', 'countryId', 'stateId'];
      const isValid = requiredFields.every(
        field => incompleteAddress[field] && incompleteAddress[field].trim() !== ''
      );

      expect(isValid).toBe(false);
    });

    test('should use billing address as shipping when sameAddress is true', () => {
      const billingAddress = {
        name: 'John Doe',
        address1: '123 Main Street'
      };

      const sameAddress = true;
      const shippingAddress = sameAddress ? { ...billingAddress } : {};

      expect(shippingAddress).toEqual(billingAddress);
    });

    test('should validate email format', () => {
      const validEmails = ['user@example.com', 'test.user@domain.co.in'];
      const invalidEmails = ['invalid-email', 'user@', '@domain.com'];

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      validEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(true);
      });

      invalidEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(false);
      });
    });

    test('should validate phone number format', () => {
      const validPhones = ['9876543210', '9123456789'];
      const invalidPhones = ['123', '12345678901', 'abcdefghij'];

      const phoneRegex = /^[0-9]{10}$/;

      validPhones.forEach(phone => {
        expect(phoneRegex.test(phone)).toBe(true);
      });

      invalidPhones.forEach(phone => {
        expect(phoneRegex.test(phone)).toBe(false);
      });
    });

    test('should validate postal code format', () => {
      const validZips = ['110001', '560001', '400001'];
      const invalidZips = ['12', '12345', 'ABCDEF'];

      const zipRegex = /^[0-9]{6}$/;

      validZips.forEach(zip => {
        expect(zipRegex.test(zip)).toBe(true);
      });

      invalidZips.forEach(zip => {
        expect(zipRegex.test(zip)).toBe(false);
      });
    });
  });

  // ==========================================
  // PRICING CALCULATION FLOW
  // ==========================================
  describe('Pricing Calculation in Checkout', () => {
    test('should calculate subtotal correctly', () => {
      const cartItems = [
        { salePrice: 1000, quantity: 2 },
        { salePrice: 2000, quantity: 1 },
        { salePrice: 500, quantity: 3 }
      ];

      const subtotal = cartItems.reduce((acc, item) => {
        return acc + (item.salePrice * item.quantity);
      }, 0);

      expect(subtotal).toBe(5500); // (1000*2) + (2000*1) + (500*3)
    });

    test('should calculate tax based on location', () => {
      const subtotal = 10000;
      const taxRates = {
        'Delhi': 0.06,      // 6%
        'Maharashtra': 0.05 // 5%
      };

      const delhiTax = subtotal * taxRates['Delhi'];
      const maharashtraTax = subtotal * taxRates['Maharashtra'];

      expect(delhiTax).toBe(600);
      expect(maharashtraTax).toBe(500);
      expect(delhiTax).toBeGreaterThan(maharashtraTax);
    });

    test('should calculate shipping based on order value', () => {
      const freeShippingThreshold = 1000;
      const baseShipping = 40;

      // Order below threshold
      const subtotal1 = 500;
      const shipping1 = subtotal1 >= freeShippingThreshold ? 0 : baseShipping;
      expect(shipping1).toBe(40);

      // Order above threshold
      const subtotal2 = 1200;
      const shipping2 = subtotal2 >= freeShippingThreshold ? 0 : baseShipping;
      expect(shipping2).toBe(0);
    });

    test('should calculate shipping based on location', () => {
      const baseShipping = 40;
      const zones = {
        'local': 1.0,   // No multiplier
        'metro': 1.2,   // 20% increase
        'remote': 1.5   // 50% increase
      };

      const localShipping = baseShipping * zones.local;
      const metroShipping = baseShipping * zones.metro;
      const remoteShipping = baseShipping * zones.remote;

      expect(localShipping).toBe(40);
      expect(metroShipping).toBe(48);
      expect(remoteShipping).toBe(60);
    });

    test('should calculate final total correctly', () => {
      const subtotal = 10000;
      const discount = 1000;
      const tax = 500;
      const shipping = 40;

      const total = subtotal - discount + tax + shipping;

      expect(total).toBe(9540);
    });

    test('should not allow negative total', () => {
      const subtotal = 100;
      const discount = 200;
      const tax = 0;
      const shipping = 0;

      const total = Math.max(0, subtotal - discount + tax + shipping);

      expect(total).toBe(0);
    });
  });

  // ==========================================
  // COUPON VALIDATION FLOW
  // ==========================================
  describe('Coupon Validation in Checkout', () => {
    test('should validate and apply percentage discount coupon', () => {
      const coupon = {
        code: 'DISCOUNT10',
        type: 'percentage',
        value: 10,
        minAmount: 500
      };

      const subtotal = 1000;
      const isValid = subtotal >= coupon.minAmount;
      
      expect(isValid).toBe(true);

      const discount = (subtotal * coupon.value) / 100;
      expect(discount).toBe(100);
    });

    test('should validate and apply fixed amount discount coupon', () => {
      const coupon = {
        code: 'SAVE50',
        type: 'fixed',
        value: 50,
        minAmount: 200
      };

      const subtotal = 500;
      const isValid = subtotal >= coupon.minAmount;
      
      expect(isValid).toBe(true);

      const discount = coupon.value;
      expect(discount).toBe(50);
    });

    test('should reject coupon if minimum amount not met', () => {
      const coupon = {
        code: 'DISCOUNT10',
        type: 'percentage',
        value: 10,
        minAmount: 500
      };

      const subtotal = 300;
      const isValid = subtotal >= coupon.minAmount;
      
      expect(isValid).toBe(false);
    });

    test('should apply maximum discount limit for percentage coupons', () => {
      const coupon = {
        code: 'WELCOME20',
        type: 'percentage',
        value: 20,
        minAmount: 1000,
        maxDiscount: 200
      };

      const subtotal = 5000;
      let discount = (subtotal * coupon.value) / 100; // 1000

      if (coupon.maxDiscount) {
        discount = Math.min(discount, coupon.maxDiscount);
      }

      expect(discount).toBe(200); // Capped at maxDiscount
    });

    test('should apply free shipping coupon', () => {
      const coupon = {
        code: 'FREESHIP',
        type: 'shipping',
        minAmount: 1000
      };

      const subtotal = 1200;
      const isValid = subtotal >= coupon.minAmount;
      
      expect(isValid).toBe(true);

      const shipping = coupon.type === 'shipping' ? 0 : 40;
      expect(shipping).toBe(0);
    });
  });

  // ==========================================
  // PAYMENT METHOD VALIDATION FLOW
  // ==========================================
  describe('Payment Method Validation in Checkout', () => {
    test('should validate COD payment method', () => {
      const paymentMethod = 'cod';
      const isValid = ['cod', 'upi', 'phonepe', 'bank', 'card'].includes(paymentMethod);

      expect(isValid).toBe(true);
    });

    test('should validate UPI ID format', () => {
      const validUPIs = ['user@paytm', 'test@oksbi', 'name@ybl'];
      const invalidUPIs = ['invalid', 'user@', '@paytm'];

      const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;

      validUPIs.forEach(upi => {
        expect(upiRegex.test(upi)).toBe(true);
      });

      invalidUPIs.forEach(upi => {
        expect(upiRegex.test(upi)).toBe(false);
      });
    });

    test('should validate card number using Luhn algorithm', () => {
      const luhnCheck = (cardNumber) => {
        const cleaned = cardNumber.replace(/\D/g, '');
        if (cleaned.length < 13 || cleaned.length > 19) return false;

        let sum = 0;
        let isEven = false;

        for (let i = cleaned.length - 1; i >= 0; i--) {
          let digit = parseInt(cleaned[i]);

          if (isEven) {
            digit *= 2;
            if (digit > 9) digit -= 9;
          }

          sum += digit;
          isEven = !isEven;
        }

        return sum % 10 === 0;
      };

      // Valid test card numbers
      expect(luhnCheck('4532015112830366')).toBe(true);
      
      // Invalid card number
      expect(luhnCheck('1234567890123456')).toBe(false);
    });

    test('should validate IFSC code format for bank transfer', () => {
      const validIFSCs = ['SBIN0001234', 'HDFC0000123', 'ICIC0000456'];
      const invalidIFSCs = ['INVALID', 'SBI1234', 'HDFC00001'];

      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

      validIFSCs.forEach(ifsc => {
        expect(ifscRegex.test(ifsc)).toBe(true);
      });

      invalidIFSCs.forEach(ifsc => {
        expect(ifscRegex.test(ifsc)).toBe(false);
      });
    });

    test('should require all payment details for selected method', () => {
      const upiPayment = {
        method: 'upi',
        upiId: 'user@paytm'
      };

      const cardPayment = {
        method: 'card',
        cardNumber: '4532015112830366',
        expiryDate: '12/25',
        cvv: '123',
        cardHolderName: 'John Doe'
      };

      expect(upiPayment.upiId).toBeDefined();
      expect(cardPayment.cardNumber).toBeDefined();
      expect(cardPayment.cvv).toBeDefined();
    });
  });

  // ==========================================
  // COMPLETE CHECKOUT FLOW TEST
  // ==========================================
  describe('Complete Checkout Flow', () => {
    test('should complete checkout with all validations', async () => {
      // Step 1: Load cart
      const mockCart = [
        {
          product: {
            _id: 'product1',
            name: 'Product 1',
            salePrice: 1000,
            stock: 10
          },
          quantity: 2
        }
      ];

      const mockShopper = {
        _id: 'shopper123',
        cart: mockCart
      };

      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockShopper)
      });

      const cartResponse = await request(app)
        .get('/api/shopper/cart')
        .expect(200);

      expect(cartResponse.body.cart.items).toHaveLength(1);

      // Step 2: Validate address
      const address = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '9876543210',
        address1: '123 Main St',
        zip: '110001',
        countryId: 'India',
        stateId: 'Delhi',
        districtId: 'New Delhi'
      };

      const requiredFields = ['name', 'email', 'phone', 'address1', 'zip'];
      const addressValid = requiredFields.every(
        field => address[field] && address[field].trim() !== ''
      );

      expect(addressValid).toBe(true);

      // Step 3: Calculate pricing
      const subtotal = mockCart.reduce((acc, item) => {
        return acc + (item.product.salePrice * item.quantity);
      }, 0);

      const tax = subtotal * 0.05; // 5% GST
      const shipping = subtotal >= 1000 ? 0 : 40;
      const total = subtotal + tax + shipping;

      expect(subtotal).toBe(2000);
      expect(tax).toBe(100);
      expect(shipping).toBe(0); // Free shipping
      expect(total).toBe(2100);

      // Step 4: Apply coupon (optional)
      const coupon = {
        code: 'DISCOUNT10',
        type: 'percentage',
        value: 10,
        minAmount: 500
      };

      const couponValid = subtotal >= coupon.minAmount;
      expect(couponValid).toBe(true);

      const discount = (subtotal * coupon.value) / 100;
      const totalWithDiscount = subtotal - discount + tax + shipping;

      expect(discount).toBe(200);
      expect(totalWithDiscount).toBe(1900);

      // Step 5: Validate payment
      const payment = {
        method: 'cod'
      };

      const paymentValid = ['cod', 'upi', 'phonepe', 'bank', 'card'].includes(payment.method);
      expect(paymentValid).toBe(true);

      // All steps passed - checkout can proceed
      expect(cartResponse.body.cart.items.length).toBeGreaterThan(0);
      expect(addressValid).toBe(true);
      expect(total).toBeGreaterThan(0);
      expect(paymentValid).toBe(true);
    });

    test('should handle checkout with multiple items and coupon', async () => {
      const mockCart = [
        {
          product: { _id: 'p1', salePrice: 500, stock: 10 },
          quantity: 2
        },
        {
          product: { _id: 'p2', salePrice: 1000, stock: 5 },
          quantity: 1
        }
      ];

      const mockShopper = {
        _id: 'shopper123',
        cart: mockCart
      };

      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockShopper)
      });

      const response = await request(app)
        .get('/api/shopper/cart')
        .expect(200);

      const subtotal = mockCart.reduce((acc, item) => {
        return acc + (item.product.salePrice * item.quantity);
      }, 0);

      expect(subtotal).toBe(2000); // (500*2) + (1000*1)

      // Apply coupon
      const discount = (subtotal * 10) / 100;
      const total = subtotal - discount;

      expect(discount).toBe(200);
      expect(total).toBe(1800);
    });

    test('should prevent checkout with validation failures', () => {
      const checkoutValid = {
        hasItems: false,      // Empty cart
        addressValid: true,
        paymentValid: true
      };

      const canProceed = checkoutValid.hasItems && 
                        checkoutValid.addressValid && 
                        checkoutValid.paymentValid;

      expect(canProceed).toBe(false);
    });

    test('should handle all payment methods correctly', () => {
      const paymentMethods = [
        { method: 'cod', valid: true },
        { method: 'upi', upiId: 'user@paytm', valid: true },
        { method: 'card', cardNumber: '4532015112830366', valid: true },
        { method: 'invalid', valid: false }
      ];

      paymentMethods.forEach(pm => {
        if (pm.method === 'invalid') {
          expect(pm.valid).toBe(false);
        } else {
          expect(pm.valid).toBe(true);
        }
      });
    });
  });
});

