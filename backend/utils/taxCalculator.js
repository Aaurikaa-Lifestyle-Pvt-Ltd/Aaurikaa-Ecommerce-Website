/**
 * Tax Calculation Utility
 * Handles GST/VAT calculations and tax compliance for invoices
 */

/**
 * Calculate tax for an order based on Indian GST system
 * @param {number} taxableAmount - The amount on which tax should be calculated
 * @param {string} taxType - Type of tax (GST, VAT, etc.)
 * @param {number} taxRate - Tax rate percentage (default: 18% for GST)
 * @returns {Object} Tax calculation result
 */
const calculateTax = (taxableAmount, taxType = 'GST', taxRate = 18) => {
  try {
    if (taxableAmount < 0) {
      return {
        success: false,
        error: 'Invalid taxable amount'
      };
    }

    if (taxRate < 0 || taxRate > 100) {
      return {
        success: false,
        error: 'Invalid tax rate'
      };
    }

    const taxAmount = (taxableAmount * taxRate) / 100;
    
    // For GST, split into CGST and SGST (9% each for 18% GST)
    let taxBreakdown = {};
    if (taxType === 'GST' && taxRate === 18) {
      taxBreakdown = {
        CGST: {
          rate: 9,
          amount: (taxableAmount * 9) / 100
        },
        SGST: {
          rate: 9,
          amount: (taxableAmount * 9) / 100
        }
      };
    } else if (taxType === 'GST' && taxRate === 12) {
      taxBreakdown = {
        CGST: {
          rate: 6,
          amount: (taxableAmount * 6) / 100
        },
        SGST: {
          rate: 6,
          amount: (taxableAmount * 6) / 100
        }
      };
    } else if (taxType === 'GST' && taxRate === 5) {
      taxBreakdown = {
        CGST: {
          rate: 2.5,
          amount: (taxableAmount * 2.5) / 100
        },
        SGST: {
          rate: 2.5,
          amount: (taxableAmount * 2.5) / 100
        }
      };
    } else {
      // For other tax types or rates, use single tax
      taxBreakdown = {
        [taxType]: {
          rate: taxRate,
          amount: taxAmount
        }
      };
    }

    return {
      success: true,
      totalTaxAmount: taxAmount,
      taxType,
      taxRate,
      taxBreakdown,
      taxableAmount
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Calculate tax for order items with different tax rates
 * @param {Array} items - Array of order items
 * @param {Object} taxConfig - Tax configuration
 * @returns {Object} Tax calculation result for all items
 */
const calculateOrderTax = (items, taxConfig = {}) => {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return {
        success: false,
        error: 'Invalid items array'
      };
    }

    let totalTaxableAmount = 0;
    let totalTaxAmount = 0;
    const itemTaxBreakdown = [];
    const taxSummary = {};

    for (const item of items) {
      const itemTotal = item.price * item.quantity;
      const itemTaxRate = item.taxRate || taxConfig.defaultTaxRate || 18;
      const itemTaxType = item.taxType || taxConfig.defaultTaxType || 'GST';

      const taxResult = calculateTax(itemTotal, itemTaxType, itemTaxRate);
      
      if (!taxResult.success) {
        return taxResult;
      }

      totalTaxableAmount += itemTotal;
      totalTaxAmount += taxResult.totalTaxAmount;

      itemTaxBreakdown.push({
        itemId: item.product,
        itemName: item.productName || 'Product',
        quantity: item.quantity,
        unitPrice: item.price,
        totalAmount: itemTotal,
        taxRate: itemTaxRate,
        taxType: itemTaxType,
        taxAmount: taxResult.totalTaxAmount,
        taxBreakdown: taxResult.taxBreakdown
      });

      // Aggregate tax summary
      const taxKey = `${itemTaxType}_${itemTaxRate}`;
      if (!taxSummary[taxKey]) {
        taxSummary[taxKey] = {
          taxType: itemTaxType,
          taxRate: itemTaxRate,
          taxableAmount: 0,
          taxAmount: 0,
          taxBreakdown: {}
        };
      }
      taxSummary[taxKey].taxableAmount += itemTotal;
      taxSummary[taxKey].taxAmount += taxResult.totalTaxAmount;

      // Merge tax breakdown
      Object.keys(taxResult.taxBreakdown).forEach(key => {
        if (!taxSummary[taxKey].taxBreakdown[key]) {
          taxSummary[taxKey].taxBreakdown[key] = {
            rate: taxResult.taxBreakdown[key].rate,
            amount: 0
          };
        }
        taxSummary[taxKey].taxBreakdown[key].amount += taxResult.taxBreakdown[key].amount;
      });
    }

    return {
      success: true,
      totalTaxableAmount,
      totalTaxAmount,
      itemTaxBreakdown,
      taxSummary: Object.values(taxSummary)
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Generate compliant invoice number
 * @param {Date} invoiceDate - Date of invoice generation
 * @param {number} sequenceNumber - Sequence number for the day
 * @param {string} prefix - Invoice prefix (default: INV)
 * @returns {string} Compliant invoice number
 */
const generateCompliantInvoiceNumber = (invoiceDate = new Date(), sequenceNumber = 1, prefix = 'INV') => {
  try {
    const year = invoiceDate.getFullYear();
    const month = String(invoiceDate.getMonth() + 1).padStart(2, '0');
    const day = String(invoiceDate.getDate()).padStart(2, '0');
    const sequence = String(sequenceNumber).padStart(4, '0');
    
    return `${prefix}-${year}${month}${day}-${sequence}`;
  } catch (error) {
    throw new Error(`Failed to generate invoice number: ${error.message}`);
  }
};

/**
 * Validate tax compliance requirements
 * @param {Object} order - Order object
 * @param {Object} taxCalculation - Tax calculation result
 * @returns {Object} Compliance validation result
 */
const validateTaxCompliance = (order, taxCalculation) => {
  try {
    const compliance = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Check if order has required fields
    if (!order.buyer) {
      compliance.errors.push('Buyer information is required for tax compliance');
      compliance.isValid = false;
    }

    if (!order.billingDetails || !order.billingDetails.address) {
      compliance.errors.push('Billing address is required for tax compliance');
      compliance.isValid = false;
    }

    // Check if tax calculation is valid
    if (!taxCalculation.success) {
      compliance.errors.push(`Tax calculation failed: ${taxCalculation.error}`);
      compliance.isValid = false;
    }

    // Check if tax amount is reasonable (not more than 30% of order value)
    if (taxCalculation.totalTaxAmount > order.totalAmount * 0.3) {
      compliance.warnings.push('Tax amount seems unusually high');
    }

    // Check if invoice number is compliant
    if (!order.invoiceNumber || !order.invoiceNumber.match(/^INV-\d{8}-\d{4}$/)) {
      compliance.errors.push('Invoice number format is not compliant');
      compliance.isValid = false;
    }

    return compliance;

  } catch (error) {
    return {
      isValid: false,
      errors: [`Compliance validation failed: ${error.message}`],
      warnings: []
    };
  }
};

module.exports = {
  calculateTax,
  calculateOrderTax,
  generateCompliantInvoiceNumber,
  validateTaxCompliance
};
