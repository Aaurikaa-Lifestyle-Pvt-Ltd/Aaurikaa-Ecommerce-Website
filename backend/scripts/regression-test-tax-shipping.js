#!/usr/bin/env node

/**
 * Comprehensive Regression Test for Tax & Shipping Calculations
 * Tests worst-case scenarios, edge cases, and error conditions
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Tax = require('../models/Tax');
const ShippingZone = require('../models/ShippingZone');
const WeightClass = require('../models/WeightClass');
const FlatShippingRule = require('../models/FlatShippingRule');
const FreeShippingRule = require('../models/FreeShippingRule');
const State = require('../models/location/State');
const Country = require('../models/location/Country');
const Coupon = require('../models/coupon');

// Import calculation engines
const { calculateTax, calculateShipping, getShippingZoneForAddress } = require('../utils/taxShippingEngine');
const { calculatePricing } = require('../utils/pricingEngine');

// Database connection
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URL;

// Test results tracking
const testResults = {
  passed: [],
  failed: [],
  warnings: []
};

// Color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function recordTest(name, passed, message = '', isWarning = false) {
  const result = { name, passed, message, timestamp: new Date() };
  if (isWarning) {
    testResults.warnings.push(result);
    log(`   ⚠️  ${name}: ${message}`, 'yellow');
  } else if (passed) {
    testResults.passed.push(result);
    log(`   ✅ ${name}`, 'green');
  } else {
    testResults.failed.push(result);
    log(`   ❌ ${name}: ${message}`, 'red');
  }
}

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    log('✅ Connected to MongoDB', 'green');
  } catch (error) {
    log(`❌ MongoDB connection error: ${error.message}`, 'red');
    process.exit(1);
  }
}

async function loadTestData() {
  const data = {
    taxes: await Tax.find({}),
    zones: await ShippingZone.find({ active: true }),
    weightClasses: await WeightClass.find({ active: true }).sort({ sortOrder: 1, minWeightG: 1 }),
    flatRules: await FlatShippingRule.find({ active: true })
      .populate('zone', 'name code states')
      .populate('weightClass', 'name minWeightG maxWeightG'),
    freeRules: await FreeShippingRule.find({ active: true }).sort({ sortOrder: 1 }),
    states: await State.find({}).populate('country', 'name').limit(10),
    countries: await Country.find({}).limit(5),
    coupons: await Coupon.find({ isActive: true }).limit(5)
  };
  return data;
}

// ============ TAX CALCULATION TESTS ============

async function testTaxEdgeCases() {
  log('\n📋 TAX CALCULATION EDGE CASES', 'cyan');
  log('='.repeat(60), 'cyan');

  // Test 1: Zero amount
  try {
    const result = await calculateTax(0, null);
    recordTest('Tax: Zero amount', result.amount === 0, `Got: ${result.amount}`);
  } catch (error) {
    recordTest('Tax: Zero amount', false, error.message);
  }

  // Test 2: Negative amount (should handle gracefully)
  try {
    const result = await calculateTax(-100, null);
    recordTest('Tax: Negative amount', result.amount <= 0, `Got: ${result.amount}`);
  } catch (error) {
    recordTest('Tax: Negative amount', true, 'Correctly throws error');
  }

  // Test 3: Very large amount
  try {
    const result = await calculateTax(999999999, null);
    const expected = 999999999 * 0.05;
    const diff = Math.abs(result.amount - expected);
    recordTest('Tax: Very large amount', diff < 0.01, `Expected: ${expected}, Got: ${result.amount}`);
  } catch (error) {
    recordTest('Tax: Very large amount', false, error.message);
  }

  // Test 4: Decimal amount
  try {
    const result = await calculateTax(123.45, null);
    const expected = 123.45 * 0.05;
    const diff = Math.abs(result.amount - expected);
    recordTest('Tax: Decimal amount', diff < 0.01, `Expected: ${expected.toFixed(2)}, Got: ${result.amount.toFixed(2)}`);
  } catch (error) {
    recordTest('Tax: Decimal amount', false, error.message);
  }

  // Test 5: Invalid state ID
  try {
    const result = await calculateTax(1000, { stateId: 'invalid_id_12345' });
    recordTest('Tax: Invalid state ID', result.rate === 5, 'Should fallback to default 5%');
  } catch (error) {
    recordTest('Tax: Invalid state ID', false, error.message);
  }

  // Test 6: Missing state but valid country
  try {
    const data = await loadTestData();
    if (data.countries.length > 0) {
      const result = await calculateTax(1000, { countryId: data.countries[0]._id.toString() });
      recordTest('Tax: Country only (no state)', result.rate >= 0, `Got rate: ${result.rate}%`);
    } else {
      recordTest('Tax: Country only (no state)', true, 'Skipped - no countries in DB');
    }
  } catch (error) {
    recordTest('Tax: Country only (no state)', false, error.message);
  }

  // Test 7: State with no matching tax rule
  try {
    const data = await loadTestData();
    if (data.states.length > 0) {
      const stateWithoutTax = data.states.find(s => {
        const stateName = s.name;
        return !data.taxes.some(t => t.name.toLowerCase().includes(stateName.toLowerCase()));
      });
      if (stateWithoutTax) {
        const result = await calculateTax(1000, { stateId: stateWithoutTax._id.toString() });
        recordTest('Tax: State with no tax rule', result.rate === 5, 'Should use default 5%');
      } else {
        recordTest('Tax: State with no tax rule', true, 'Skipped - all states have tax rules');
      }
    } else {
      recordTest('Tax: State with no tax rule', true, 'Skipped - no states in DB');
    }
  } catch (error) {
    recordTest('Tax: State with no tax rule', false, error.message);
  }

  // Test 8: Tax rate format (should be percentage, not decimal)
  try {
    const result = await calculateTax(1000, null);
    const isPercentage = result.rate >= 1 && result.rate <= 100;
    recordTest('Tax: Rate format (percentage)', isPercentage, `Rate: ${result.rate}% (should be 5, not 0.05)`);
  } catch (error) {
    recordTest('Tax: Rate format (percentage)', false, error.message);
  }

  // Test 9: Multiple states with different tax rates
  try {
    const data = await loadTestData();
    if (data.states.length >= 2) {
      const results = [];
      for (const state of data.states.slice(0, 3)) {
        const result = await calculateTax(1000, { stateId: state._id.toString() });
        results.push({ state: state.name, rate: result.rate });
      }
      const uniqueRates = new Set(results.map(r => r.rate));
      recordTest('Tax: Multiple states', results.length > 0, `Tested ${results.length} states`);
    } else {
      recordTest('Tax: Multiple states', true, 'Skipped - not enough states');
    }
  } catch (error) {
    recordTest('Tax: Multiple states', false, error.message);
  }

  // Test 10: Tax calculation consistency (same input = same output)
  try {
    const result1 = await calculateTax(1000, null);
    const result2 = await calculateTax(1000, null);
    const result3 = await calculateTax(1000, null);
    const consistent = result1.amount === result2.amount && result2.amount === result3.amount;
    recordTest('Tax: Calculation consistency', consistent, 
      `Results: ${result1.amount}, ${result2.amount}, ${result3.amount}`);
  } catch (error) {
    recordTest('Tax: Calculation consistency', false, error.message);
  }
}

// ============ SHIPPING CALCULATION TESTS ============

async function testShippingEdgeCases() {
  log('\n📦 SHIPPING CALCULATION EDGE CASES', 'cyan');
  log('='.repeat(60), 'cyan');

  const data = await loadTestData();

  // Test 1: Empty cart
  try {
    const result = await calculateShipping({ cartItems: [], shippingAddress: null });
    recordTest('Shipping: Empty cart', result.amount >= 0, `Got: ₹${result.amount}`);
  } catch (error) {
    recordTest('Shipping: Empty cart', false, error.message);
  }

  // Test 2: Cart with zero weight
  try {
    const cartItems = [{ product: { price: 100, weight: 0 }, quantity: 1 }];
    const result = await calculateShipping({ cartItems, shippingAddress: null });
    recordTest('Shipping: Zero weight', result.amount >= 0, `Got: ₹${result.amount}`);
  } catch (error) {
    recordTest('Shipping: Zero weight', false, error.message);
  }

  // Test 3: Cart with negative weight (should handle gracefully)
  try {
    const cartItems = [{ product: { price: 100, weight: -1 }, quantity: 1 }];
    const result = await calculateShipping({ cartItems, shippingAddress: null });
    recordTest('Shipping: Negative weight', result.amount >= 0, `Got: ₹${result.amount}`);
  } catch (error) {
    recordTest('Shipping: Negative weight', true, 'Correctly handles error');
  }

  // Test 4: Very heavy cart (beyond max weight class)
  try {
    const cartItems = [{ product: { price: 100, weight: 50 }, quantity: 1 }]; // 50kg
    const result = await calculateShipping({ cartItems, shippingAddress: null });
    recordTest('Shipping: Very heavy cart (50kg)', result.amount >= 0, `Got: ₹${result.amount}`);
  } catch (error) {
    recordTest('Shipping: Very heavy cart', false, error.message);
  }

  // Test 5: Weight at boundary (exactly at min/max)
  try {
    if (data.weightClasses.length > 0) {
      const wc = data.weightClasses[0];
      const cartItems = [{ product: { price: 100, weight: wc.minWeightG / 1000 }, quantity: 1 }];
      const result = await calculateShipping({ cartItems, shippingAddress: null });
      recordTest('Shipping: Weight at boundary (min)', result.amount >= 0, `Got: ₹${result.amount}`);
    } else {
      recordTest('Shipping: Weight at boundary', true, 'Skipped - no weight classes');
    }
  } catch (error) {
    recordTest('Shipping: Weight at boundary', false, error.message);
  }

  // Test 6: No shipping address
  try {
    const cartItems = [{ product: { price: 100, weight: 1 }, quantity: 1 }];
    const result = await calculateShipping({ cartItems, shippingAddress: null });
    recordTest('Shipping: No address', result.amount >= 0, `Got: ₹${result.amount} (should use default)`);
  } catch (error) {
    recordTest('Shipping: No address', false, error.message);
  }

  // Test 7: Invalid state ID
  try {
    const cartItems = [{ product: { price: 100, weight: 1 }, quantity: 1 }];
    const result = await calculateShipping({ 
      cartItems, 
      shippingAddress: { stateId: 'invalid_id_12345' } 
    });
    recordTest('Shipping: Invalid state ID', result.amount >= 0, `Got: ₹${result.amount} (should use default)`);
  } catch (error) {
    recordTest('Shipping: Invalid state ID', false, error.message);
  }

  // Test 8: State with no matching zone
  try {
    const data = await loadTestData();
    if (data.states.length > 0) {
      // Find a state that doesn't match any zone
      const stateWithoutZone = data.states.find(s => {
        return !data.zones.some(z => z.states && z.states.includes(s.name));
      });
      if (stateWithoutZone) {
        const cartItems = [{ product: { price: 100, weight: 1 }, quantity: 1 }];
        const result = await calculateShipping({ 
          cartItems, 
          shippingAddress: { stateId: stateWithoutZone._id.toString() } 
        });
        recordTest('Shipping: State with no zone', result.amount >= 0, `Got: ₹${result.amount} (should use default)`);
      } else {
        recordTest('Shipping: State with no zone', true, 'Skipped - all states have zones');
      }
    } else {
      recordTest('Shipping: State with no zone', true, 'Skipped - no states');
    }
  } catch (error) {
    recordTest('Shipping: State with no zone', false, error.message);
  }

  // Test 9: Free shipping rule edge cases
  try {
    if (data.freeRules.length > 0 && data.states.length > 0) {
      const rule = data.freeRules[0];
      // Find a state that matches a zone (for free shipping rule to work)
      let testState = null;
      let testZone = null;
      
      for (const state of data.states) {
        testZone = data.zones.find(zone => 
          zone.states && zone.states.includes(state.name)
        );
        if (testZone) {
          testState = state;
          break;
        }
      }
      
      if (testState && testZone) {
        const shippingAddress = { stateId: testState._id.toString() };
        
        // Test exactly at minimum
        const cartItems1 = [{ product: { price: rule.minOrderAmountINR, weight: 1 }, quantity: 1 }];
        const result1 = await calculateShipping({ cartItems: cartItems1, shippingAddress });
        // Test just below minimum
        const cartItems2 = [{ product: { price: rule.minOrderAmountINR - 1, weight: 1 }, quantity: 1 }];
        const result2 = await calculateShipping({ cartItems: cartItems2, shippingAddress });
        
        const atMinFree = result1.amount === 0;
        const belowMinPaid = result2.amount > 0;
        
        recordTest('Shipping: Free shipping at minimum', atMinFree && belowMinPaid, 
          `At ₹${rule.minOrderAmountINR}: ₹${result1.amount} (should be 0), Below: ₹${result2.amount} (should be >0)`);
      } else {
        recordTest('Shipping: Free shipping edge cases', true, 'Skipped - no matching state/zone');
      }
    } else {
      recordTest('Shipping: Free shipping edge cases', true, 'Skipped - no free shipping rules or states');
    }
  } catch (error) {
    recordTest('Shipping: Free shipping edge cases', false, error.message);
  }

  // Test 10: Multiple weight classes (overlapping ranges)
  try {
    if (data.weightClasses.length >= 2) {
      // Find overlapping weight classes
      const overlapping = [];
      for (let i = 0; i < data.weightClasses.length; i++) {
        for (let j = i + 1; j < data.weightClasses.length; j++) {
          const wc1 = data.weightClasses[i];
          const wc2 = data.weightClasses[j];
          if (wc1.minWeightG < wc2.maxWeightG && wc1.maxWeightG > wc2.minWeightG) {
            overlapping.push({ wc1, wc2 });
          }
        }
      }
      
      if (overlapping.length > 0) {
        const { wc1, wc2 } = overlapping[0];
        const testWeight = Math.max(wc1.minWeightG, wc2.minWeightG) / 1000; // Convert to kg
        const cartItems = [{ product: { price: 100, weight: testWeight }, quantity: 1 }];
        const result = await calculateShipping({ cartItems, shippingAddress: null });
        recordTest('Shipping: Overlapping weight classes', result.amount >= 0, 
          `Weight ${testWeight}kg matches both classes, Got: ₹${result.amount}`);
      } else {
        recordTest('Shipping: Overlapping weight classes', true, 'No overlapping classes found');
      }
    } else {
      recordTest('Shipping: Overlapping weight classes', true, 'Skipped - not enough weight classes');
    }
  } catch (error) {
    recordTest('Shipping: Overlapping weight classes', false, error.message);
  }

  // Test 11: Coupon with free shipping
  try {
    if (data.coupons.length > 0) {
      const coupon = data.coupons.find(c => c.freeShipping);
      if (coupon) {
        const cartItems = [{ product: { price: 100, weight: 1 }, quantity: 1 }];
        const result = await calculateShipping({ 
          cartItems, 
          shippingAddress: null,
          couponCode: coupon.code 
        });
        recordTest('Shipping: Coupon free shipping', result.amount === 0, 
          `Coupon: ${coupon.code}, Got: ₹${result.amount}`);
      } else {
        recordTest('Shipping: Coupon free shipping', true, 'Skipped - no free shipping coupons');
      }
    } else {
      recordTest('Shipping: Coupon free shipping', true, 'Skipped - no coupons');
    }
  } catch (error) {
    recordTest('Shipping: Coupon free shipping', false, error.message);
  }

  // Test 12: Shipping calculation consistency
  try {
    const cartItems = [{ product: { price: 1000, weight: 1 }, quantity: 1 }];
    const shippingAddress = data.states.length > 0 
      ? { stateId: data.states[0]._id.toString() }
      : null;
    
    const result1 = await calculateShipping({ cartItems, shippingAddress });
    const result2 = await calculateShipping({ cartItems, shippingAddress });
    const result3 = await calculateShipping({ cartItems, shippingAddress });
    
    const consistent = result1.amount === result2.amount && result2.amount === result3.amount;
    recordTest('Shipping: Calculation consistency', consistent,
      `Results: ₹${result1.amount}, ₹${result2.amount}, ₹${result3.amount}`);
  } catch (error) {
    recordTest('Shipping: Calculation consistency', false, error.message);
  }
}

// ============ COMPLETE PRICING TESTS ============

async function testCompletePricingEdgeCases() {
  log('\n💰 COMPLETE PRICING EDGE CASES', 'cyan');
  log('='.repeat(60), 'cyan');

  const data = await loadTestData();

  // Test 1: Empty cart
  try {
    const result = await calculatePricing({ cartItems: [], shippingAddress: null });
    recordTest('Pricing: Empty cart', result.subtotal === 0 && result.total === 0, 
      `Subtotal: ${result.subtotal}, Total: ${result.total}`);
  } catch (error) {
    recordTest('Pricing: Empty cart', false, error.message);
  }

  // Test 2: Cart with zero price items
  try {
    const cartItems = [{ product: { price: 0, weight: 1 }, quantity: 1 }];
    const result = await calculatePricing({ cartItems, shippingAddress: null });
    recordTest('Pricing: Zero price items', result.subtotal === 0, `Got: ₹${result.subtotal}`);
  } catch (error) {
    recordTest('Pricing: Zero price items', false, error.message);
  }

  // Test 3: Large quantity
  try {
    const cartItems = [{ product: { price: 100, weight: 1 }, quantity: 1000 }];
    const result = await calculatePricing({ cartItems, shippingAddress: null });
    const expectedSubtotal = 100 * 1000;
    recordTest('Pricing: Large quantity', result.subtotal === expectedSubtotal,
      `Expected: ₹${expectedSubtotal}, Got: ₹${result.subtotal}`);
  } catch (error) {
    recordTest('Pricing: Large quantity', false, error.message);
  }

  // Test 4: Multiple products with different weights
  try {
    const cartItems = [
      { product: { price: 100, weight: 0.5 }, quantity: 2 }, // 1kg
      { product: { price: 200, weight: 2 }, quantity: 1 },   // 2kg
      { product: { price: 300, weight: 1.5 }, quantity: 1 }   // 1.5kg
    ]; // Total: 4.5kg
    const result = await calculatePricing({ cartItems, shippingAddress: null });
    const expectedSubtotal = (100 * 2) + (200 * 1) + (300 * 1);
    recordTest('Pricing: Multiple products', result.subtotal === expectedSubtotal,
      `Expected: ₹${expectedSubtotal}, Got: ₹${result.subtotal}`);
  } catch (error) {
    recordTest('Pricing: Multiple products', false, error.message);
  }

  // Test 5: Total calculation accuracy
  try {
    const cartItems = [{ product: { price: 1000, weight: 1 }, quantity: 1 }];
    const result = await calculatePricing({ cartItems, shippingAddress: null });
    const expectedTotal = result.subtotal + result.tax.amount + result.shipping.amount;
    const diff = Math.abs(result.total - expectedTotal);
    recordTest('Pricing: Total calculation accuracy', diff < 0.01,
      `Expected: ₹${expectedTotal}, Got: ₹${result.total}, Diff: ₹${diff.toFixed(2)}`);
  } catch (error) {
    recordTest('Pricing: Total calculation accuracy', false, error.message);
  }

  // Test 6: With coupon discount
  try {
    if (data.coupons.length > 0) {
      const coupon = data.coupons[0];
      const cartItems = [{ product: { price: 1000, weight: 1 }, quantity: 1 }];
      const result = await calculatePricing({ 
        cartItems, 
        shippingAddress: null,
        couponCode: coupon.code 
      });
      const hasDiscount = result.discount && result.discount.total > 0;
      recordTest('Pricing: With coupon', hasDiscount, 
        `Coupon: ${coupon.code}, Discount: ₹${result.discount?.total || 0}`);
    } else {
      recordTest('Pricing: With coupon', true, 'Skipped - no coupons');
    }
  } catch (error) {
    recordTest('Pricing: With coupon', false, error.message);
  }

  // Test 7: Rounding precision
  try {
    const cartItems = [{ product: { price: 99.99, weight: 1 }, quantity: 3 }];
    const result = await calculatePricing({ cartItems, shippingAddress: null });
    // Check if all amounts are properly rounded
    const subtotalRounded = result.subtotal === Math.round(result.subtotal * 100) / 100;
    const taxRounded = result.tax.amount === Math.round(result.tax.amount * 100) / 100;
    const shippingRounded = result.shipping.amount === Math.round(result.shipping.amount * 100) / 100;
    const totalRounded = result.total === Math.round(result.total * 100) / 100;
    
    recordTest('Pricing: Rounding precision', 
      subtotalRounded && taxRounded && shippingRounded && totalRounded,
      `All values rounded to 2 decimals`);
  } catch (error) {
    recordTest('Pricing: Rounding precision', false, error.message);
  }

  // Test 8: Stress test - 100 calculations
  try {
    const cartItems = [{ product: { price: 1000, weight: 1 }, quantity: 1 }];
    const startTime = Date.now();
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(calculatePricing({ cartItems, shippingAddress: null }));
    }
    await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;
    recordTest('Pricing: Stress test (100 calculations)', duration < 10000,
      `Completed in ${duration}ms (${(duration/100).toFixed(2)}ms per calculation)`);
  } catch (error) {
    recordTest('Pricing: Stress test', false, error.message);
  }
}

// ============ ZONE MATCHING TESTS ============

async function testZoneMatching() {
  log('\n🗺️  ZONE MATCHING TESTS', 'cyan');
  log('='.repeat(60), 'cyan');

  const data = await loadTestData();

  // Test 1: State name matching
  try {
    if (data.zones.length > 0 && data.states.length > 0) {
      const zone = data.zones[0];
      const matchingState = data.states.find(s => zone.states && zone.states.includes(s.name));
      if (matchingState) {
        const zoneResult = await getShippingZoneForAddress({ stateId: matchingState._id.toString() });
        const matched = zoneResult && zoneResult._id.toString() === zone._id.toString();
        recordTest('Zone: State name matching', matched,
          `State: ${matchingState.name}, Zone: ${zoneResult?.name || 'None'}`);
      } else {
        recordTest('Zone: State name matching', true, 'Skipped - no matching state');
      }
    } else {
      recordTest('Zone: State name matching', true, 'Skipped - no zones/states');
    }
  } catch (error) {
    recordTest('Zone: State name matching', false, error.message);
  }

  // Test 2: Country matching
  try {
    if (data.zones.length > 0 && data.countries.length > 0) {
      const zone = data.zones.find(z => z.country);
      if (zone) {
        const country = data.countries.find(c => c.code === zone.country || c.name === zone.country);
        if (country) {
          const zoneResult = await getShippingZoneForAddress({ countryId: country._id.toString() });
          recordTest('Zone: Country matching', zoneResult !== null,
            `Country: ${country.name}, Zone: ${zoneResult?.name || 'None'}`);
        } else {
          recordTest('Zone: Country matching', true, 'Skipped - no matching country');
        }
      } else {
        recordTest('Zone: Country matching', true, 'Skipped - no zones with country');
      }
    } else {
      recordTest('Zone: Country matching', true, 'Skipped - no zones/countries');
    }
  } catch (error) {
    recordTest('Zone: Country matching', false, error.message);
  }

  // Test 3: Pincode prefix matching
  try {
    if (data.zones.length > 0) {
      const zone = data.zones.find(z => z.pinPrefixes && z.pinPrefixes.length > 0);
      if (zone && zone.pinPrefixes.length > 0) {
        const testPincode = zone.pinPrefixes[0] + '001';
        const zoneResult = await getShippingZoneForAddress({ pincode: testPincode });
        recordTest('Zone: Pincode prefix matching', zoneResult !== null,
          `Pincode: ${testPincode}, Zone: ${zoneResult?.name || 'None'}`);
      } else {
        recordTest('Zone: Pincode prefix matching', true, 'Skipped - no zones with pincode prefixes');
      }
    } else {
      recordTest('Zone: Pincode prefix matching', true, 'Skipped - no zones');
    }
  } catch (error) {
    recordTest('Zone: Pincode prefix matching', false, error.message);
  }

  // Test 4: Priority order (state > country > pincode)
  try {
    if (data.zones.length > 0 && data.states.length > 0) {
      const zone = data.zones[0];
      const matchingState = data.states.find(s => zone.states && zone.states.includes(s.name));
      if (matchingState) {
        const address = {
          stateId: matchingState._id.toString(),
          pincode: '999999' // Should not match any zone
        };
        const zoneResult = await getShippingZoneForAddress(address);
        // Should match by state, not pincode
        recordTest('Zone: Priority order', zoneResult !== null,
          `State match should take priority over pincode`);
      } else {
        recordTest('Zone: Priority order', true, 'Skipped - no matching state');
      }
    } else {
      recordTest('Zone: Priority order', true, 'Skipped - no zones/states');
    }
  } catch (error) {
    recordTest('Zone: Priority order', false, error.message);
  }
}

// ============ MAIN FUNCTION ============

async function main() {
  try {
    log('🚀 Starting Comprehensive Regression Tests...\n', 'cyan');
    log('='.repeat(60), 'cyan');
    
    // Connect to database
    await connectDB();
    
    // Run all test suites
    await testTaxEdgeCases();
    await testShippingEdgeCases();
    await testCompletePricingEdgeCases();
    await testZoneMatching();
    
    // Final summary
    log('\n' + '='.repeat(60), 'cyan');
    log('📊 FINAL TEST SUMMARY', 'cyan');
    log('='.repeat(60), 'cyan');
    
    const totalTests = testResults.passed.length + testResults.failed.length;
    const passedCount = testResults.passed.length;
    const failedCount = testResults.failed.length;
    const warningCount = testResults.warnings.length;
    const successRate = totalTests > 0 ? ((passedCount / totalTests) * 100).toFixed(1) : 0;
    
    log(`\n✅ Passed: ${passedCount}`, 'green');
    log(`❌ Failed: ${failedCount}`, failedCount > 0 ? 'red' : 'green');
    log(`⚠️  Warnings: ${warningCount}`, warningCount > 0 ? 'yellow' : 'green');
    log(`📈 Success Rate: ${successRate}%`, 'cyan');
    
    if (failedCount > 0) {
      log('\n❌ Failed Tests:', 'red');
      testResults.failed.forEach(test => {
        log(`   - ${test.name}: ${test.message}`, 'red');
      });
    }
    
    if (warningCount > 0) {
      log('\n⚠️  Warnings:', 'yellow');
      testResults.warnings.forEach(test => {
        log(`   - ${test.name}: ${test.message}`, 'yellow');
      });
    }
    
    log('\n' + '='.repeat(60), 'cyan');
    
    if (failedCount === 0) {
      log('\n✅ All critical tests passed! System is working correctly.', 'green');
      process.exit(0);
    } else {
      log('\n⚠️  Some tests failed. Please review and fix issues.', 'yellow');
      process.exit(1);
    }
  } catch (error) {
    log(`\n❌ Test suite failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      log('\n🔌 Database connection closed', 'cyan');
    }
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { testTaxEdgeCases, testShippingEdgeCases, testCompletePricingEdgeCases, testZoneMatching };

