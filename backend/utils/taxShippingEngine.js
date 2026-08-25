/** @deprecated Use gstEngineService.js for tax logic */
const mongoose = require('mongoose');
const Tax = require('../models/Tax');

const ShippingZone = require('../models/ShippingZone');
const FreeShippingRule = require('../models/FreeShippingRule');
const Coupon = require('../models/coupon');
const State = require('../models/location/State');
const Country = require('../models/location/Country');
const shippingEngineService = require('../services/shippingEngineService');

/**
 * Calculate tax based on location and product types

 * @param {number} taxableAmount - Amount to calculate tax on
 * @param {Object} shippingAddress - Shipping address with location details
 * @param {Object} options - Tax calculation options
 * @returns {Object} Tax calculation result
 */
async function calculateTax(taxableAmount, shippingAddress, options = {}) {
  try {
    let taxRate = 0.05; // Default 5% GST
    let taxName = 'GST';
    let included = options.taxIncluded || false;
    let breakdown = {};

    // If no shipping address provided, use default tax
    if (!shippingAddress) {
      return {
        amount: taxableAmount * taxRate,
        rate: taxRate * 100, // Return as percentage
        rateDecimal: taxRate,
        name: taxName,
        included,
        breakdown: { source: 'default', reason: 'No shipping address provided' }
      };
    }

    // Try to get tax rate from database based on location
    try {
      const stateId = shippingAddress.stateId || shippingAddress.state;
      const countryId = shippingAddress.countryId || shippingAddress.country;

      if (stateId) {
        // Get state details
        let state = null;
        if (mongoose.Types.ObjectId.isValid(stateId)) {
          try {
            state = await State.findById(stateId).populate('country');
          } catch (err) {
            console.warn('⚠️ calculateTax: State findById failed', err.message);
          }
        }

        if (state) {
          // Look for state-specific tax rules
          const stateTax = await Tax.findOne({
            name: { $regex: new RegExp(state.name, 'i') }
          });

          if (stateTax) {
            taxRate = stateTax.percentage / 100;
            taxName = stateTax.name;
            breakdown = {
              source: 'database',
              state: state.name,
              taxId: stateTax._id,
              taxName: stateTax.name
            };
          } else {
            // Use default tax rate but with state context
            breakdown = {
              source: 'default_with_state',
              state: state.name,
              reason: 'No specific tax rule found for state'
            };
          }
        } else if (typeof stateId === 'string' && !mongoose.Types.ObjectId.isValid(stateId)) {
          // Fallback: If stateId is a name, try finding tax by that name directly
          const stateTax = await Tax.findOne({
            name: { $regex: new RegExp(`^${stateId}$`, 'i') }
          });
          if (stateTax) {
            taxRate = stateTax.percentage / 100;
            taxName = stateTax.name;
            breakdown = {
              source: 'database_by_name',
              state: stateId,
              taxId: stateTax._id,
              taxName: stateTax.name
            };
          }
        }
      } else if (countryId) {

        // Get country details
        const country = await Country.findById(countryId);
        if (country) {
          // Look for country-specific tax rules
          const countryTax = await Tax.findOne({
            name: { $regex: new RegExp(country.name, 'i') }
          });

          if (countryTax) {
            taxRate = countryTax.percentage / 100;
            taxName = countryTax.name;
            breakdown = {
              source: 'database',
              country: country.name,
              taxId: countryTax._id,
              taxName: countryTax.name
            };
          } else {
            breakdown = {
              source: 'default_with_country',
              country: country.name,
              reason: 'No specific tax rule found for country'
            };
          }
        }
      }

      // Apply tax calculation
      const taxAmount = taxableAmount * taxRate;

      return {
        amount: taxAmount,
        rate: taxRate * 100, // Return as percentage (e.g., 5 for 5%)
        rateDecimal: taxRate, // Also include decimal for internal use
        name: taxName,
        included,
        breakdown
      };

    } catch (error) {
      console.error('❌ Tax calculation error:', error);
      // Fallback to default tax calculation
      return {
        amount: taxableAmount * taxRate,
        rate: taxRate * 100, // Return as percentage
        rateDecimal: taxRate,
        name: taxName,
        included,
        breakdown: {
          source: 'fallback',
          error: error.message,
          reason: 'Database error, using default tax rate'
        }
      };
    }

  } catch (error) {
    console.error('❌ Tax calculation error:', error);
    return {
      amount: 0,
      rate: 0, // Percentage
      rateDecimal: 0,
      name: 'Error',
      included: false,
      breakdown: {
        source: 'error',
        error: error.message
      }
    };
  }
}

/**
 * Calculate shipping cost based on location and selected Shipping Slabs (WeightClasses).
 * Delegates to shippingEngineService; fail-closed errors propagate (no ₹50 substitute).
 * @param {Object} params - Shipping calculation parameters
 * @param {Array} params.cartItems - Cart items for slab + logistics weight
 * @param {Object} params.shippingAddress - Shipping address
 * @param {string} params.couponCode - Coupon code for free shipping
 * @param {Object} params.options - Additional options (unused; reserved)
 * @returns {Object} Shipping calculation result
 */
async function calculateShipping({ cartItems, shippingAddress, couponCode, options = {} }) {
  // Delegate to slab-select engine (Single Source of Truth). Do not catch fail-closed errors.
  void options;
  const result = await shippingEngineService.calculateShipping({
    cartItems,
    shippingAddress,
    couponCode
  });

  // Map engine result to legacy format expected by existing callers
  return {
    amount: result.shippingCharge,
    method: result.shippingMethod,
    label: result.ruleApplied?.name || result.label || 'Shipping',
    breakdown: {
      ...result,
      source: 'shippingEngineService_v2'
    }
  };
}


/**
 * Get shipping zone for a given address
 * @param {Object} address - Shipping address
 * @returns {Object|null} Shipping zone or null
 */
async function getShippingZoneForAddress(address) {
  try {
    const { stateId, countryId, pincode } = address;

    // First try to match by state
    if (stateId) {
      const state = await State.findById(stateId);
      if (state) {
        // Priority 1: Match by State ID (Robust)
        let zone = await ShippingZone.findOne({
          active: true,
          stateIds: stateId
        });

        // Priority 2: Match by State Name (Legacy Fallback)
        if (!zone) {
          zone = await ShippingZone.findOne({
            active: true,
            states: { $regex: new RegExp(`^${state.name}$`, 'i') }
          });
        }

        if (zone) return zone;
      }
    }

    // Try to match by country
    if (countryId) {
      const country = await Country.findById(countryId);
      if (country) {
        const zone = await ShippingZone.findOne({
          active: true,
          country: country.code
        });
        if (zone) return zone;
      }
    }

    // Try to match by pincode prefix
    if (pincode) {
      const pincodePrefix = pincode.substring(0, 3);
      const zone = await ShippingZone.findOne({
        active: true,
        pinPrefixes: { $in: [pincodePrefix] }
      });
      if (zone) return zone;
    }

    return null;

  } catch (error) {
    console.error('❌ Error getting shipping zone:', error);
    return null;
  }
}

/**
 * Check for free shipping rules
 * @deprecated This function is deprecated. Free shipping logic is now integrated into calculateShipping().
 * Kept for backward compatibility with tests.
 * @param {Object} params - Parameters for free shipping check
 * @returns {Object} Free shipping result
 */
async function checkFreeShippingRules({ cartItems, shippingAddress, shippingZone, couponCode }) {
  try {
    // Calculate cart total
    const cartTotal = cartItems.reduce((acc, item) => {
      const price = item.product?.salePrice || item.product?.price || item.price || 0;
      const quantity = item.quantity || item.qty || 1;
      return acc + (price * quantity);
    }, 0);

    // Check free shipping rules
    const freeShippingRules = await FreeShippingRule.find({
      active: true,
      $or: [
        { allZones: true },
        { zones: shippingZone ? shippingZone._id : null }
      ]
    }).sort({ minOrderAmountINR: 1 });

    for (const rule of freeShippingRules) {
      if (cartTotal >= rule.minOrderAmountINR) {
        return {
          isFree: true,
          reason: `Free shipping on orders above ₹${rule.minOrderAmountINR}`,
          rule: rule.name
        };
      }
    }

    // Check if coupon provides free shipping
    if (couponCode) {
      const Coupon = require('../models/coupon');
      const coupon = await Coupon.findOne({
        code: couponCode.toUpperCase(),
        isActive: true,
        freeShipping: true
      });

      if (coupon) {
        return {
          isFree: true,
          reason: `Free shipping with coupon ${couponCode}`,
          rule: 'coupon_free_shipping'
        };
      }
    }

    return {
      isFree: false,
      reason: 'No free shipping rules apply'
    };

  } catch (error) {
    console.error('❌ Error checking free shipping rules:', error);
    return {
      isFree: false,
      reason: 'Error checking free shipping rules'
    };
  }
}

/**
 * Get available shipping methods for an address (Shipping Slabs + zone rates).
 * No ₹50 default: missing zone/rule → available false, cost null.
 * @param {Object} shippingAddress - Shipping address
 * @returns {Array} Available shipping methods (weight classes with rates)
 */
async function getAvailableShippingMethods(shippingAddress) {
  return shippingEngineService.getAvailableShippingMethods(shippingAddress);
}

/**
 * Get tax rates for a location
 * @param {Object} shippingAddress - Shipping address
 * @returns {Array} Available tax rates
 */
async function getTaxRatesForLocation(shippingAddress) {
  try {
    if (!shippingAddress) {
      // Return default tax rates
      return await Tax.find().sort({ name: 1 });
    }

    const stateId = shippingAddress.stateId || shippingAddress.state;
    const countryId = shippingAddress.countryId || shippingAddress.country;

    let taxRates = [];

    if (stateId) {
      const state = await State.findById(stateId);
      if (state) {
        // Get state-specific tax rates
        taxRates = await Tax.find({
          name: { $regex: new RegExp(state.name, 'i') }
        });
      }
    }

    if (taxRates.length === 0 && countryId) {
      const country = await Country.findById(countryId);
      if (country) {
        // Get country-specific tax rates
        taxRates = await Tax.find({
          name: { $regex: new RegExp(country.name, 'i') }
        });
      }
    }

    // If no specific rates found, return all available rates
    if (taxRates.length === 0) {
      taxRates = await Tax.find().sort({ name: 1 });
    }

    return taxRates;

  } catch (error) {
    console.error('❌ Error getting tax rates for location:', error);
    return [];
  }
}

module.exports = {
  calculateTax,
  calculateShipping,
  getShippingZoneForAddress,
  getAvailableShippingMethods,
  getTaxRatesForLocation,
  checkFreeShippingRules // Deprecated, kept for test compatibility
};
