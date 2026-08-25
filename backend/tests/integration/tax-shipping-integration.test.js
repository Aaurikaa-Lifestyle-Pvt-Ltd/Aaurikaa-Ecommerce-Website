// Integration tests for Tax & Shipping Integration

const request = require('supertest');
const express = require('express');

// Create a test app without starting the server
const app = express();
app.use(express.json());

// Import and use the pricing routes
const pricingRoutes = require('../../routes/pricingRoutes');
app.use('/api/pricing', pricingRoutes);

// Mock authentication middleware
jest.mock('../../middleware/verifyAdmin', () => (req, res, next) => {
  req.user = { id: 'admin123', role: 'admin' };
  next();
});

jest.mock('../../middleware/verifySeller', () => (req, res, next) => {
  req.user = { id: 'seller123', role: 'seller' };
  next();
});

describe('Tax & Shipping Integration Tests', () => {
  describe('Tax Calculation API', () => {
    test('should calculate tax for given amount and address', async () => {
      const requestBody = {
        amount: 1000,
        shippingAddress: {
          stateId: 'state123',
          countryId: 'country123'
        },
        options: {
          taxIncluded: false
        }
      };

      const response = await request(app)
        .post('/api/pricing/calculate-tax')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('amount');
      expect(response.body.data).toHaveProperty('rate');
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('breakdown');
      expect(typeof response.body.data.amount).toBe('number');
      expect(typeof response.body.data.rate).toBe('number');
    });

    test('should handle invalid amount in tax calculation', async () => {
      const requestBody = {
        amount: -100,
        shippingAddress: {
          stateId: 'state123'
        }
      };

      const response = await request(app)
        .post('/api/pricing/calculate-tax')
        .send(requestBody)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Valid amount is required');
    });

    test('should calculate tax without shipping address', async () => {
      const requestBody = {
        amount: 1000
      };

      const response = await request(app)
        .post('/api/pricing/calculate-tax')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.breakdown.source).toBe('default');
    });

    test('should handle tax calculation errors gracefully', async () => {
      const requestBody = {
        amount: 1000,
        shippingAddress: {
          stateId: 'invalid_state_id'
        }
      };

      const response = await request(app)
        .post('/api/pricing/calculate-tax')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.breakdown.source).toBe('fallback');
    });
  });

  describe('Shipping Calculation API', () => {
    test('should calculate shipping for cart items and address', async () => {
      const requestBody = {
        cartItems: [
          {
            product: {
              price: 100,
              weight: 1
            },
            quantity: 2
          }
        ],
        shippingAddress: {
          stateId: 'state123',
          pincode: '110001'
        },
        couponCode: null
      };

      const response = await request(app)
        .post('/api/pricing/calculate-shipping')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('amount');
      expect(response.body.data).toHaveProperty('method');
      expect(response.body.data).toHaveProperty('label');
      expect(response.body.data).toHaveProperty('breakdown');
      expect(typeof response.body.data.amount).toBe('number');
    });

    test('should handle empty cart items in shipping calculation', async () => {
      const requestBody = {
        cartItems: [],
        shippingAddress: {
          stateId: 'state123'
        }
      };

      const response = await request(app)
        .post('/api/pricing/calculate-shipping')
        .send(requestBody)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cart items are required');
    });

    test('should calculate shipping without address', async () => {
      const requestBody = {
        cartItems: [
          {
            product: {
              price: 100,
              weight: 1
            },
            quantity: 1
          }
        ]
      };

      const response = await request(app)
        .post('/api/pricing/calculate-shipping')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.breakdown.source).toBe('default');
    });

    test('should apply free shipping with coupon', async () => {
      const requestBody = {
        cartItems: [
          {
            product: {
              price: 100,
              weight: 1
            },
            quantity: 1
          }
        ],
        couponCode: 'FREESHIP'
      };

      const response = await request(app)
        .post('/api/pricing/calculate-shipping')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Note: This test assumes the coupon exists in the database
      // In a real scenario, you'd need to set up test data
    });

    test('should handle shipping calculation errors gracefully', async () => {
      const requestBody = {
        cartItems: [
          {
            product: {
              price: 100,
              weight: 1
            },
            quantity: 1
          }
        ],
        shippingAddress: {
          stateId: 'invalid_state_id'
        }
      };

      const response = await request(app)
        .post('/api/pricing/calculate-shipping')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.breakdown.source).toBe('error_fallback');
    });
  });

  describe('Shipping Methods API', () => {
    test('should get available shipping methods for address', async () => {
      const requestBody = {
        shippingAddress: {
          stateId: 'state123',
          pincode: '110001'
        }
      };

      const response = await request(app)
        .post('/api/pricing/shipping-methods')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should get default shipping methods when no address provided', async () => {
      const requestBody = {};

      const response = await request(app)
        .post('/api/pricing/shipping-methods')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should handle shipping methods errors gracefully', async () => {
      const requestBody = {
        shippingAddress: {
          stateId: 'invalid_state_id'
        }
      };

      const response = await request(app)
        .post('/api/pricing/shipping-methods')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Tax Rates API', () => {
    test('should get tax rates for location', async () => {
      const requestBody = {
        shippingAddress: {
          stateId: 'state123',
          countryId: 'country123'
        }
      };

      const response = await request(app)
        .post('/api/pricing/tax-rates')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should get default tax rates when no address provided', async () => {
      const requestBody = {};

      const response = await request(app)
        .post('/api/pricing/tax-rates')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should handle tax rates errors gracefully', async () => {
      const requestBody = {
        shippingAddress: {
          stateId: 'invalid_state_id'
        }
      };

      const response = await request(app)
        .post('/api/pricing/tax-rates')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Complete Pricing Integration', () => {
    test('should calculate complete pricing with tax and shipping', async () => {
      const requestBody = {
        cartItems: [
          {
            product: {
              price: 100,
              weight: 1
            },
            quantity: 2
          }
        ],
        shippingAddress: {
          stateId: 'state123',
          pincode: '110001'
        },
        couponCode: null,
        options: {
          taxIncluded: false
        }
      };

      const response = await request(app)
        .post('/api/pricing/calculate')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('subtotal');
      expect(response.body.data).toHaveProperty('discount');
      expect(response.body.data).toHaveProperty('tax');
      expect(response.body.data).toHaveProperty('shipping');
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('breakdown');
      expect(response.body.data).toHaveProperty('metadata');

      // Verify tax integration
      expect(response.body.data.tax).toHaveProperty('amount');
      expect(response.body.data.tax).toHaveProperty('rate');
      expect(typeof response.body.data.tax.amount).toBe('number');

      // Verify shipping integration
      expect(response.body.data.shipping).toHaveProperty('amount');
      expect(response.body.data.shipping).toHaveProperty('method');
      expect(response.body.data.shipping).toHaveProperty('label');
      expect(typeof response.body.data.shipping.amount).toBe('number');

      // Verify total calculation includes tax and shipping
      const expectedTotal = response.body.data.subtotal - 
                           response.body.data.discount.total + 
                           response.body.data.tax.amount + 
                           response.body.data.shipping.amount;
      expect(response.body.data.total).toBeCloseTo(expectedTotal, 2);
    });

    test('should handle pricing calculation with free shipping coupon', async () => {
      const requestBody = {
        cartItems: [
          {
            product: {
              price: 100,
              weight: 1
            },
            quantity: 1
          }
        ],
        shippingAddress: {
          stateId: 'state123'
        },
        couponCode: 'FREESHIP'
      };

      const response = await request(app)
        .post('/api/pricing/calculate')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.shipping.amount).toBe(0);
      expect(response.body.data.shipping.method).toBe('free');
    });

    test('should handle pricing calculation without address', async () => {
      const requestBody = {
        cartItems: [
          {
            product: {
              price: 100,
              weight: 1
            },
            quantity: 1
          }
        ]
      };

      const response = await request(app)
        .post('/api/pricing/calculate')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tax.breakdown.source).toBe('default');
      expect(response.body.data.shipping.breakdown.source).toBe('default');
    });

    test('should validate pricing result integrity', async () => {
      const requestBody = {
        cartItems: [
          {
            product: {
              price: 100,
              weight: 1
            },
            quantity: 1
          }
        ],
        shippingAddress: {
          stateId: 'state123'
        }
      };

      const response = await request(app)
        .post('/api/pricing/calculate')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Verify all amounts are non-negative
      expect(response.body.data.subtotal).toBeGreaterThanOrEqual(0);
      expect(response.body.data.discount.total).toBeGreaterThanOrEqual(0);
      expect(response.body.data.tax.amount).toBeGreaterThanOrEqual(0);
      expect(response.body.data.shipping.amount).toBeGreaterThanOrEqual(0);
      expect(response.body.data.total).toBeGreaterThanOrEqual(0);

      // Verify total calculation
      const calculatedTotal = response.body.data.subtotal - 
                             response.body.data.discount.total + 
                             response.body.data.tax.amount + 
                             response.body.data.shipping.amount;
      expect(response.body.data.total).toBeCloseTo(calculatedTotal, 2);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed request data', async () => {
      const requestBody = {
        cartItems: 'not an array',
        shippingAddress: 'not an object'
      };

      const response = await request(app)
        .post('/api/pricing/calculate')
        .send(requestBody)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle missing required fields', async () => {
      const requestBody = {};

      const response = await request(app)
        .post('/api/pricing/calculate')
        .send(requestBody)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle extreme values gracefully', async () => {
      const requestBody = {
        cartItems: [
          {
            product: {
              price: 999999999,
              weight: 999999999
            },
            quantity: 999999999
          }
        ],
        shippingAddress: {
          stateId: 'state123'
        }
      };

      const response = await request(app)
        .post('/api/pricing/calculate')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBeGreaterThan(0);
    });

    test('should handle concurrent requests efficiently', async () => {
      const requestBody = {
        cartItems: [
          {
            product: {
              price: 100,
              weight: 1
            },
            quantity: 1
          }
        ],
        shippingAddress: {
          stateId: 'state123'
        }
      };

      const requests = Array(5).fill().map(() => 
        request(app)
          .post('/api/pricing/calculate')
          .send(requestBody)
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });
});
