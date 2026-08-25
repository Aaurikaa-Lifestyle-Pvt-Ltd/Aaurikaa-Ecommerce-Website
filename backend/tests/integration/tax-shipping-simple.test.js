// Simple integration tests for Tax & Shipping Integration

const request = require('supertest');
const express = require('express');

// Create a test app without starting the server
const app = express();
app.use(express.json());

// Import and use the pricing routes
const pricingRoutes = require('../../routes/pricingRoutes');
app.use('/api/pricing', pricingRoutes);

describe('Tax & Shipping Integration - Simple Tests', () => {
  describe('Tax Calculation API', () => {
    test('should calculate tax for given amount without address', async () => {
      const requestBody = {
        amount: 1000
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
      expect(response.body.data.amount).toBeGreaterThan(0);
    });

    test('should handle invalid amount in tax calculation', async () => {
      const requestBody = {
        amount: -100
      };

      const response = await request(app)
        .post('/api/pricing/calculate-tax')
        .send(requestBody)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Valid amount is required');
    });
  });

  describe('Shipping Calculation API', () => {
    test('should calculate shipping for cart items without address', async () => {
      const requestBody = {
        cartItems: [
          {
            product: {
              price: 100,
              weight: 1
            },
            quantity: 2
          }
        ]
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
      expect(response.body.data.amount).toBeGreaterThanOrEqual(0);
    });

    test('should handle empty cart items in shipping calculation', async () => {
      const requestBody = {
        cartItems: []
      };

      const response = await request(app)
        .post('/api/pricing/calculate-shipping')
        .send(requestBody)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cart items are required');
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
        ]
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
      expect(response.body.data.tax.amount).toBeGreaterThanOrEqual(0);

      // Verify shipping integration
      expect(response.body.data.shipping).toHaveProperty('amount');
      expect(response.body.data.shipping).toHaveProperty('method');
      expect(response.body.data.shipping).toHaveProperty('label');
      expect(typeof response.body.data.shipping.amount).toBe('number');
      expect(response.body.data.shipping.amount).toBeGreaterThanOrEqual(0);

      // Verify total calculation includes tax and shipping
      const expectedTotal = response.body.data.subtotal - 
                           response.body.data.discount.total + 
                           response.body.data.tax.amount + 
                           response.body.data.shipping.amount;
      expect(response.body.data.total).toBeCloseTo(expectedTotal, 2);
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
      
      // Verify tax structure
      expect(response.body.data.tax).toHaveProperty('amount');
      expect(response.body.data.tax).toHaveProperty('rate');
      expect(response.body.data.tax).toHaveProperty('included');
      
      // Verify shipping structure
      expect(response.body.data.shipping).toHaveProperty('amount');
      expect(response.body.data.shipping).toHaveProperty('method');
      expect(response.body.data.shipping).toHaveProperty('label');
      expect(response.body.data.shipping).toHaveProperty('breakdown');
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
        ]
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

  describe('Error Handling', () => {
    test('should handle malformed request data', async () => {
      const requestBody = {
        cartItems: 'not an array'
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
  });
});
