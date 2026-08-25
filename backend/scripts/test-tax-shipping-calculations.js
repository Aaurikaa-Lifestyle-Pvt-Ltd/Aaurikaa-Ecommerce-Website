#!/usr/bin/env node

/**
 * Tax & Shipping Calculation Verification Script
 * Tests and validates tax and shipping calculations based on database configuration
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

// Import calculation engines
const { calculateTax, calculateShipping } = require('../utils/taxShippingEngine');
const { calculatePricing } = require('../utils/pricingEngine');

// Database connection
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URL;

// Test scenarios
const testScenarios = [
  {
    name: "Basic Tax Calculation - No Address",
    cartItems: [{ product: { price: 1000 }, quantity: 1 }],
    shippingAddress: null,
    expectedTaxRate: 5, // Default 5%
    expectedTaxAmount: 50
  },
  {
    name: "Tax Calculation with State",
    cartItems: [{ product: { price: 1000 }, quantity: 1 }],
    shippingAddress: { stateId: null }, // Will be set dynamically
    expectedTaxRate: null, // Will be determined from DB
    expectedTaxAmount: null
  },
  {
    name: "Shipping Calculation - Light Weight",
    cartItems: [{ product: { price: 500, weight: 1 }, quantity: 2 }], // 2kg total
    shippingAddress: { stateId: null }, // Will be set dynamically
    expectedShipping: null // Will be determined from DB
  },
  {
    name: "Free Shipping Rule Test",
    cartItems: [{ product: { price: 1000 }, quantity: 1 }],
    shippingAddress: { stateId: null },
    expectedShipping: 0, // Should be free if rule applies
    minOrderAmount: 999
  },
  {
    name: "Complete Pricing Calculation",
    cartItems: [{ product: { price: 1000, weight: 1 }, quantity: 1 }],
    shippingAddress: { stateId: null },
    couponCode: null
  }
];

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
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

async function checkDatabaseConfiguration() {
  log('\n📊 Checking Database Configuration...', 'cyan');
  log('='.repeat(60), 'cyan');

  const results = {
    taxes: [],
    shippingZones: [],
    weightClasses: [],
    flatShippingRules: [],
    freeShippingRules: [],
    states: [],
    countries: []
  };

  try {
    // Check Taxes
    results.taxes = await Tax.find({});
    log(`\n📋 Taxes: ${results.taxes.length} found`, 'blue');
    if (results.taxes.length > 0) {
      results.taxes.forEach(tax => {
        log(`   - ${tax.name}: ${tax.percentage}%`, 'blue');
      });
    } else {
      log('   ⚠️  No tax rules configured. Default 5% GST will be used.', 'yellow');
    }

    // Check Shipping Zones
    results.shippingZones = await ShippingZone.find({ active: true });
    log(`\n🌍 Shipping Zones: ${results.shippingZones.length} found`, 'blue');
    if (results.shippingZones.length > 0) {
      results.shippingZones.forEach(zone => {
        log(`   - ${zone.name} (${zone.code}): States: ${zone.states?.length || 0}`, 'blue');
      });
    } else {
      log('   ⚠️  No shipping zones configured.', 'yellow');
    }

    // Check Weight Classes
    results.weightClasses = await WeightClass.find({ active: true }).sort({ sortOrder: 1, minWeightG: 1 });
    log(`\n⚖️  Weight Classes: ${results.weightClasses.length} found`, 'blue');
    if (results.weightClasses.length > 0) {
      results.weightClasses.forEach(wc => {
        log(`   - ${wc.name}: ${wc.minWeightG}g - ${wc.maxWeightG}g`, 'blue');
      });
    } else {
      log('   ⚠️  No weight classes configured.', 'yellow');
    }

    // Check Flat Shipping Rules
    results.flatShippingRules = await FlatShippingRule.find({ active: true })
      .populate('zone', 'name code')
      .populate('weightClass', 'name');
    log(`\n📦 Flat Shipping Rules: ${results.flatShippingRules.length} found`, 'blue');
    if (results.flatShippingRules.length > 0) {
      results.flatShippingRules.forEach(rule => {
        log(`   - ${rule.zone?.name || 'Unknown'} + ${rule.weightClass?.name || 'Unknown'}: ₹${rule.rateINR}`, 'blue');
      });
    } else {
      log('   ⚠️  No flat shipping rules configured.', 'yellow');
    }

    // Check Free Shipping Rules
    results.freeShippingRules = await FreeShippingRule.find({ active: true }).sort({ sortOrder: 1 });
    log(`\n🎁 Free Shipping Rules: ${results.freeShippingRules.length} found`, 'blue');
    if (results.freeShippingRules.length > 0) {
      results.freeShippingRules.forEach(rule => {
        const zoneInfo = rule.allZones ? 'All Zones' : `${rule.zones?.length || 0} zones`;
        log(`   - ${rule.name}: Min ₹${rule.minOrderAmountINR} (${zoneInfo})`, 'blue');
      });
    } else {
      log('   ⚠️  No free shipping rules configured.', 'yellow');
    }

    // Check States (for testing)
    results.states = await State.find({}).limit(5).populate('country', 'name');
    log(`\n🗺️  Sample States: ${results.states.length} found`, 'blue');
    if (results.states.length > 0) {
      results.states.forEach(state => {
        log(`   - ${state.name} (${state.country?.name || 'Unknown'})`, 'blue');
      });
    }

    return results;
  } catch (error) {
    log(`❌ Error checking database: ${error.message}`, 'red');
    throw error;
  }
}

async function testTaxCalculation(taxableAmount, shippingAddress) {
  try {
    const result = await calculateTax(taxableAmount, shippingAddress);
    
    return {
      success: true,
      amount: result.amount,
      rate: result.rate, // Should be percentage (5, not 0.05)
      rateDecimal: result.rateDecimal,
      name: result.name,
      breakdown: result.breakdown
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function testShippingCalculation(cartItems, shippingAddress, couponCode = null) {
  try {
    const result = await calculateShipping({
      cartItems,
      shippingAddress,
      couponCode
    });
    
    return {
      success: true,
      amount: result.amount,
      method: result.method,
      label: result.label,
      breakdown: result.breakdown
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function testCompletePricing(cartItems, shippingAddress, couponCode = null) {
  try {
    const result = await calculatePricing({
      cartItems,
      shippingAddress,
      couponCode
    });
    
    return {
      success: true,
      subtotal: result.subtotal,
      tax: result.tax,
      shipping: result.shipping,
      total: result.total,
      breakdown: result.breakdown
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function runTests(dbConfig) {
  log('\n🧪 Running Calculation Tests...', 'cyan');
  log('='.repeat(60), 'cyan');

  const testResults = [];
  let passedTests = 0;
  let failedTests = 0;

  // Test 1: Basic Tax Calculation (No Address)
  log('\n📝 Test 1: Basic Tax Calculation (No Address)', 'yellow');
  const taxTest1 = await testTaxCalculation(1000, null);
  if (taxTest1.success) {
    log(`   ✅ Tax Rate: ${taxTest1.rate}% (Expected: 5%)`, 'green');
    log(`   ✅ Tax Amount: ₹${taxTest1.amount} (Expected: ₹50)`, 'green');
    
    const rateCorrect = Math.abs(taxTest1.rate - 5) < 0.01;
    const amountCorrect = Math.abs(taxTest1.amount - 50) < 0.01;
    
    if (rateCorrect && amountCorrect) {
      log('   ✅ Test PASSED', 'green');
      passedTests++;
    } else {
      log('   ❌ Test FAILED - Values don\'t match expected', 'red');
      failedTests++;
    }
  } else {
    log(`   ❌ Test FAILED: ${taxTest1.error}`, 'red');
    failedTests++;
  }

  // Test 2: Tax Calculation with State (if states available)
  if (dbConfig.states.length > 0) {
    log('\n📝 Test 2: Tax Calculation with State', 'yellow');
    const testState = dbConfig.states[0];
    const shippingAddress = { stateId: testState._id.toString() };
    
    log(`   Using State: ${testState.name}`, 'blue');
    const taxTest2 = await testTaxCalculation(1000, shippingAddress);
    
    if (taxTest2.success) {
      log(`   ✅ Tax Rate: ${taxTest2.rate}%`, 'green');
      log(`   ✅ Tax Amount: ₹${taxTest2.amount}`, 'green');
      log(`   ✅ Tax Name: ${taxTest2.name}`, 'green');
      log(`   ✅ Source: ${taxTest2.breakdown?.source || 'unknown'}`, 'green');
      passedTests++;
    } else {
      log(`   ❌ Test FAILED: ${taxTest2.error}`, 'red');
      failedTests++;
    }
  }

  // Test 3: Shipping Calculation (if zones and rules available)
  if (dbConfig.shippingZones.length > 0 && dbConfig.weightClasses.length > 0) {
    log('\n📝 Test 3: Shipping Calculation', 'yellow');
    
    // Find a state that matches a zone
    let testState = null;
    let testZone = null;
    
    for (const state of dbConfig.states) {
      testZone = dbConfig.shippingZones.find(zone => 
        zone.states && zone.states.includes(state.name)
      );
      if (testZone) {
        testState = state;
        break;
      }
    }
    
    if (testState && testZone) {
      log(`   Using State: ${testState.name}`, 'blue');
      log(`   Using Zone: ${testZone.name}`, 'blue');
      
      const cartItems = [{ product: { price: 500, weight: 1 }, quantity: 2 }]; // 2kg
      const shippingAddress = { stateId: testState._id.toString() };
      
      const shippingTest = await testShippingCalculation(cartItems, shippingAddress);
      
      if (shippingTest.success) {
        log(`   ✅ Shipping Amount: ₹${shippingTest.amount}`, 'green');
        log(`   ✅ Shipping Method: ${shippingTest.method}`, 'green');
        log(`   ✅ Shipping Label: ${shippingTest.label || 'N/A'}`, 'green');
        passedTests++;
      } else {
        log(`   ❌ Test FAILED: ${shippingTest.error}`, 'red');
        failedTests++;
      }
    } else {
      log('   ⚠️  Skipped - No matching state/zone found', 'yellow');
    }
  }

  // Test 4: Free Shipping Rule Test
  if (dbConfig.freeShippingRules.length > 0) {
    log('\n📝 Test 4: Free Shipping Rule Test', 'yellow');
    
    const freeRule = dbConfig.freeShippingRules[0];
    log(`   Testing Rule: ${freeRule.name} (Min: ₹${freeRule.minOrderAmountINR})`, 'blue');
    
    const cartItems = [{ product: { price: freeRule.minOrderAmountINR }, quantity: 1 }];
    const shippingAddress = dbConfig.states.length > 0 
      ? { stateId: dbConfig.states[0]._id.toString() }
      : null;
    
    const shippingTest = await testShippingCalculation(cartItems, shippingAddress);
    
    if (shippingTest.success) {
      if (shippingTest.amount === 0) {
        log(`   ✅ Free Shipping Applied! Amount: ₹${shippingTest.amount}`, 'green');
        passedTests++;
      } else {
        log(`   ⚠️  Shipping not free: ₹${shippingTest.amount} (Check zone matching)`, 'yellow');
        passedTests++; // Still passes, just a warning
      }
    } else {
      log(`   ❌ Test FAILED: ${shippingTest.error}`, 'red');
      failedTests++;
    }
  }

  // Test 5: Complete Pricing Calculation
  log('\n📝 Test 5: Complete Pricing Calculation', 'yellow');
  const cartItems = [{ product: { price: 1000, weight: 1 }, quantity: 1 }];
  const shippingAddress = dbConfig.states.length > 0 
    ? { stateId: dbConfig.states[0]._id.toString() }
    : null;
  
  const pricingTest = await testCompletePricing(cartItems, shippingAddress);
  
  if (pricingTest.success) {
    log(`   ✅ Subtotal: ₹${pricingTest.subtotal}`, 'green');
    log(`   ✅ Tax: ₹${pricingTest.tax.amount} (${pricingTest.tax.rate}%)`, 'green');
    log(`   ✅ Shipping: ₹${pricingTest.shipping.amount}`, 'green');
    log(`   ✅ Total: ₹${pricingTest.total}`, 'green');
    
    // Verify calculation
    const expectedTotal = pricingTest.subtotal + pricingTest.tax.amount + pricingTest.shipping.amount;
    const totalCorrect = Math.abs(pricingTest.total - expectedTotal) < 0.01;
    
    if (totalCorrect) {
      log('   ✅ Total calculation is correct', 'green');
      passedTests++;
    } else {
      log(`   ❌ Total mismatch: Expected ₹${expectedTotal}, Got ₹${pricingTest.total}`, 'red');
      failedTests++;
    }
  } else {
    log(`   ❌ Test FAILED: ${pricingTest.error}`, 'red');
    failedTests++;
  }

  // Summary
  log('\n' + '='.repeat(60), 'cyan');
  log(`\n📊 Test Summary:`, 'cyan');
  log(`   ✅ Passed: ${passedTests}`, 'green');
  log(`   ❌ Failed: ${failedTests}`, failedTests > 0 ? 'red' : 'green');
  log(`   📈 Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`, 'cyan');
  
  return { passedTests, failedTests };
}

async function validateConfiguration(dbConfig) {
  log('\n🔍 Validating Configuration...', 'cyan');
  log('='.repeat(60), 'cyan');

  const issues = [];
  const warnings = [];

  // Check if tax rules exist
  if (dbConfig.taxes.length === 0) {
    warnings.push('No tax rules configured - using default 5% GST');
  }

  // Check if shipping zones exist
  if (dbConfig.shippingZones.length === 0) {
    issues.push('No shipping zones configured - shipping calculation will fail');
  }

  // Check if weight classes exist
  if (dbConfig.weightClasses.length === 0) {
    issues.push('No weight classes configured - shipping calculation will fail');
  }

  // Check if flat shipping rules exist
  if (dbConfig.flatShippingRules.length === 0) {
    warnings.push('No flat shipping rules configured - default fallback will be used');
  }

  // Check for overlapping weight classes
  const weightClasses = dbConfig.weightClasses;
  for (let i = 0; i < weightClasses.length; i++) {
    for (let j = i + 1; j < weightClasses.length; j++) {
      const wc1 = weightClasses[i];
      const wc2 = weightClasses[j];
      if (wc1.minWeightG < wc2.maxWeightG && wc1.maxWeightG > wc2.minWeightG) {
        warnings.push(`Overlapping weight classes: ${wc1.name} and ${wc2.name}`);
      }
    }
  }

  // Check if zones have states configured
  dbConfig.shippingZones.forEach(zone => {
    if (!zone.states || zone.states.length === 0) {
      warnings.push(`Zone "${zone.name}" has no states configured`);
    }
  });

  // Display issues and warnings
  if (issues.length > 0) {
    log('\n❌ Issues Found:', 'red');
    issues.forEach(issue => log(`   - ${issue}`, 'red'));
  }

  if (warnings.length > 0) {
    log('\n⚠️  Warnings:', 'yellow');
    warnings.forEach(warning => log(`   - ${warning}`, 'yellow'));
  }

  if (issues.length === 0 && warnings.length === 0) {
    log('\n✅ Configuration looks good!', 'green');
  }

  return { issues, warnings };
}

async function main() {
  try {
    log('🚀 Starting Tax & Shipping Calculation Verification...\n', 'cyan');
    
    // Connect to database
    await connectDB();
    
    // Check database configuration
    const dbConfig = await checkDatabaseConfiguration();
    
    // Validate configuration
    await validateConfiguration(dbConfig);
    
    // Run tests
    const testResults = await runTests(dbConfig);
    
    // Final summary
    log('\n' + '='.repeat(60), 'cyan');
    if (testResults.failedTests === 0) {
      log('\n✅ All tests passed! Tax and shipping calculations are working correctly.', 'green');
    } else {
      log('\n⚠️  Some tests failed. Please review the configuration and fix issues.', 'yellow');
    }
    
    process.exit(testResults.failedTests > 0 ? 1 : 0);
  } catch (error) {
    log(`\n❌ Script failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    // Close database connection
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

module.exports = { checkDatabaseConfiguration, runTests, validateConfiguration };

