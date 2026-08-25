// Pricing Routes - Centralized pricing calculation endpoints

const express = require('express');
const router = express.Router();
const {
  calculateCartPricing,
  validateCouponCode,
  calculateProductPricing,
  calculateOrderBreakdown,
  calculateTax,
  calculateShippingCost,
  getShippingMethods,
  getTaxRates,
  pricingHealthCheck
} = require('../controllers/pricingController');

// Health check endpoint (no authentication required)
router.get('/health', pricingHealthCheck);

// Pricing calculation endpoints
router.post('/calculate', calculateCartPricing);
router.post('/validate-coupon', validateCouponCode);
router.post('/product', calculateProductPricing);
router.post('/order-breakdown', calculateOrderBreakdown);

// Tax and shipping calculation endpoints
router.post('/calculate-tax', calculateTax);
router.post('/calculate-shipping', calculateShippingCost);
router.post('/shipping-methods', getShippingMethods);
router.post('/tax-rates', getTaxRates);

module.exports = router;
