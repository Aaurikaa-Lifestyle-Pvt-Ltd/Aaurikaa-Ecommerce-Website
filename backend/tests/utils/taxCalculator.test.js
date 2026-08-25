/**
 * Tax Calculator Tests
 * Tests for tax calculation and compliance functionality
 */

const {
  calculateTax,
  calculateOrderTax,
  generateCompliantInvoiceNumber,
  validateTaxCompliance
} = require('../../utils/taxCalculator');

describe('Tax Calculator Tests', () => {
  describe('calculateTax', () => {
    test('should calculate GST tax correctly for 18% rate', () => {
      const result = calculateTax(1000, 'GST', 18);
      
      expect(result.success).toBe(true);
      expect(result.totalTaxAmount).toBe(180);
      expect(result.taxType).toBe('GST');
      expect(result.taxRate).toBe(18);
      expect(result.taxableAmount).toBe(1000);
      expect(result.taxBreakdown.CGST.rate).toBe(9);
      expect(result.taxBreakdown.CGST.amount).toBe(90);
      expect(result.taxBreakdown.SGST.rate).toBe(9);
      expect(result.taxBreakdown.SGST.amount).toBe(90);
    });

    test('should calculate GST tax correctly for 12% rate', () => {
      const result = calculateTax(1000, 'GST', 12);
      
      expect(result.success).toBe(true);
      expect(result.totalTaxAmount).toBe(120);
      expect(result.taxBreakdown.CGST.rate).toBe(6);
      expect(result.taxBreakdown.CGST.amount).toBe(60);
      expect(result.taxBreakdown.SGST.rate).toBe(6);
      expect(result.taxBreakdown.SGST.amount).toBe(60);
    });

    test('should calculate GST tax correctly for 5% rate', () => {
      const result = calculateTax(1000, 'GST', 5);
      
      expect(result.success).toBe(true);
      expect(result.totalTaxAmount).toBe(50);
      expect(result.taxBreakdown.CGST.rate).toBe(2.5);
      expect(result.taxBreakdown.CGST.amount).toBe(25);
      expect(result.taxBreakdown.SGST.rate).toBe(2.5);
      expect(result.taxBreakdown.SGST.amount).toBe(25);
    });

    test('should calculate VAT tax correctly', () => {
      const result = calculateTax(1000, 'VAT', 15);
      
      expect(result.success).toBe(true);
      expect(result.totalTaxAmount).toBe(150);
      expect(result.taxType).toBe('VAT');
      expect(result.taxRate).toBe(15);
      expect(result.taxBreakdown.VAT.rate).toBe(15);
      expect(result.taxBreakdown.VAT.amount).toBe(150);
    });

    test('should handle invalid taxable amount', () => {
      const result = calculateTax(-100, 'GST', 18);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid taxable amount');
    });

    test('should handle invalid tax rate', () => {
      const result = calculateTax(1000, 'GST', 150);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid tax rate');
    });

    test('should handle zero taxable amount', () => {
      const result = calculateTax(0, 'GST', 18);
      
      expect(result.success).toBe(true);
      expect(result.totalTaxAmount).toBe(0);
    });
  });

  describe('calculateOrderTax', () => {
    const mockItems = [
      {
        product: 'product1',
        productName: 'Product 1',
        quantity: 2,
        price: 100,
        taxRate: 18,
        taxType: 'GST'
      },
      {
        product: 'product2',
        productName: 'Product 2',
        quantity: 1,
        price: 200,
        taxRate: 12,
        taxType: 'GST'
      }
    ];

    test('should calculate tax for multiple items with different rates', () => {
      const result = calculateOrderTax(mockItems);
      
      expect(result.success).toBe(true);
      expect(result.totalTaxableAmount).toBe(400); // (2*100) + (1*200)
      expect(result.totalTaxAmount).toBe(60); // (200*0.18) + (200*0.12)
      expect(result.itemTaxBreakdown).toHaveLength(2);
      expect(result.taxSummary).toHaveLength(2);
    });

    test('should handle empty items array', () => {
      const result = calculateOrderTax([]);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid items array');
    });

    test('should use default tax configuration', () => {
      const itemsWithoutTax = [
        {
          product: 'product1',
          productName: 'Product 1',
          quantity: 1,
          price: 100
        }
      ];

      const result = calculateOrderTax(itemsWithoutTax, {
        defaultTaxRate: 18,
        defaultTaxType: 'GST'
      });
      
      expect(result.success).toBe(true);
      expect(result.totalTaxAmount).toBe(18);
      expect(result.taxSummary[0].taxType).toBe('GST');
      expect(result.taxSummary[0].taxRate).toBe(18);
    });
  });

  describe('generateCompliantInvoiceNumber', () => {
    test('should generate compliant invoice number', () => {
      const testDate = new Date('2024-01-15');
      const invoiceNumber = generateCompliantInvoiceNumber(testDate, 1);
      
      expect(invoiceNumber).toBe('INV-20240115-0001');
    });

    test('should generate invoice number with custom prefix', () => {
      const testDate = new Date('2024-12-25');
      const invoiceNumber = generateCompliantInvoiceNumber(testDate, 42, 'BILL');
      
      expect(invoiceNumber).toBe('BILL-20241225-0042');
    });

    test('should handle sequence numbers with padding', () => {
      const testDate = new Date('2024-06-01');
      const invoiceNumber = generateCompliantInvoiceNumber(testDate, 999);
      
      expect(invoiceNumber).toBe('INV-20240601-0999');
    });
  });

  describe('validateTaxCompliance', () => {
    const mockOrder = {
      buyer: 'buyer123',
      billingDetails: {
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'Test State',
          postalCode: '123456',
          country: 'India'
        }
      },
      totalAmount: 1000,
      invoiceNumber: 'INV-20240115-0001'
    };

    const mockTaxCalculation = {
      success: true,
      totalTaxableAmount: 847.46,
      totalTaxAmount: 152.54
    };

    test('should validate compliant order', () => {
      const result = validateTaxCompliance(mockOrder, mockTaxCalculation);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect missing buyer information', () => {
      const orderWithoutBuyer = { ...mockOrder, buyer: null };
      const result = validateTaxCompliance(orderWithoutBuyer, mockTaxCalculation);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Buyer information is required for tax compliance');
    });

    test('should detect missing billing address', () => {
      const orderWithoutAddress = { ...mockOrder, billingDetails: null };
      const result = validateTaxCompliance(orderWithoutAddress, mockTaxCalculation);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Billing address is required for tax compliance');
    });

    test('should detect invalid tax calculation', () => {
      const invalidTaxCalculation = { success: false, error: 'Calculation failed' };
      const result = validateTaxCompliance(mockOrder, invalidTaxCalculation);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tax calculation failed: Calculation failed');
    });

    test('should detect unusually high tax amount', () => {
      const highTaxCalculation = {
        success: true,
        totalTaxAmount: 500 // 50% of order value
      };
      const result = validateTaxCompliance(mockOrder, highTaxCalculation);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Tax amount seems unusually high');
    });

    test('should detect invalid invoice number format', () => {
      const orderWithInvalidInvoice = { ...mockOrder, invoiceNumber: 'INVALID-123' };
      const result = validateTaxCompliance(orderWithInvalidInvoice, mockTaxCalculation);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invoice number format is not compliant');
    });
  });
});
