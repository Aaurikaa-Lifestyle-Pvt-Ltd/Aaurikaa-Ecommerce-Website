/**
 * Shared utility for parsing bulk discount data
 * Handles various input formats and malformed data gracefully
 */

/**
 * Parse bulk discount data safely with comprehensive error handling
 * @param {any} val - The bulk discount value to parse
 * @returns {Object} - Properly structured bulk discount object
 */
const parseBulkDiscount = (val) => {
  try {
    if (!val || val === '' || val === '{}') {
      return {
        enabled: false,
        tiers: []
      };
    }
    
    if (typeof val === 'string') {
      // Check if the string is "[object Object]" which indicates an object was stringified incorrectly
      if (val === '[object Object]') {
        console.warn('Received "[object Object]" string for bulk discount - treating as disabled');
        return {
          enabled: false,
          tiers: []
        };
      }
      
      // Clean the string of any control characters
      const cleanedVal = val.replace(/[\x00-\x1F\x7F]/g, '');
      
      // Try to parse as JSON, but handle cases where it's not valid JSON
      try {
        const parsed = JSON.parse(cleanedVal);
        return {
          enabled: Boolean(parsed.enabled),
          tiers: Array.isArray(parsed.tiers) ? parsed.tiers : []
        };
      } catch (jsonError) {
        console.warn('Failed to parse bulk discount JSON:', jsonError.message);
        return {
          enabled: false,
          tiers: []
        };
      }
    }
    
    if (typeof val === 'object' && val !== null) {
      return {
        enabled: Boolean(val.enabled),
        tiers: Array.isArray(val.tiers) ? val.tiers : []
      };
    }
    
    return {
      enabled: false,
      tiers: []
    };
  } catch (error) {
    console.error('Error parsing bulk discount:', error);
    return {
      enabled: false,
      tiers: []
    };
  }
};

module.exports = { parseBulkDiscount };
