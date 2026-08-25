jest.mock('../../models/CustomerEnquiry');
jest.mock('../../models/Order');

const CustomerEnquiry = require('../../models/CustomerEnquiry');
const Order = require('../../models/Order');
const {
  assertValidStatusTransition,
  validateOrderLink,
  createCustomerEnquiry,
} = require('../../services/customerEnquiryService');

describe('customerEnquiryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('assertValidStatusTransition', () => {
    const allowedTransitions = [
      ['submitted', 'in_review'],
      ['submitted', 'resolved'],
      ['submitted', 'closed'],
      ['in_review', 'resolved'],
      ['in_review', 'closed'],
      ['resolved', 'closed'],
    ];

    it.each(allowedTransitions)('allows %s to %s', (from, to) => {
      expect(assertValidStatusTransition(from, to).valid).toBe(true);
    });

    const blockedTransitions = [
      ['closed', 'submitted'],
      ['closed', 'in_review'],
      ['closed', 'resolved'],
    ];

    it.each(blockedTransitions)('rejects %s to %s', (from, to) => {
      expect(assertValidStatusTransition(from, to).valid).toBe(false);
    });
  });

  describe('validateOrderLink', () => {
    it('allows empty order reference', async () => {
      const result = await validateOrderLink({
        orderId: null,
        orderInvoiceNumber: null,
        submitterEmail: 'test@example.com',
      });
      expect(result.valid).toBe(true);
      expect(result.order).toBeNull();
    });

    it('rejects shopper linking another shoppers order', async () => {
      Order.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'order1',
            buyer: 'shopperB',
            invoiceNumber: 'INV-20260101-000001',
            billingDetails: { email: 'buyer@example.com' },
            shippingDetails: {},
          }),
        }),
      });

      const result = await validateOrderLink({
        orderId: 'order1',
        submitterEmail: 'buyer@example.com',
        shopperId: 'shopperA',
      });

      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(403);
    });

    it('links order when guest email matches billing email', async () => {
      Order.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'order2',
            buyer: 'shopperC',
            invoiceNumber: 'INV-20260101-000002',
            billingDetails: { email: 'guest@example.com' },
            shippingDetails: {},
          }),
        }),
      });

      const result = await validateOrderLink({
        orderInvoiceNumber: 'INV-20260101-000002',
        submitterEmail: 'guest@example.com',
      });

      expect(result.valid).toBe(true);
      expect(result.order).toBe('order2');
      expect(result.orderInvoiceNumber).toBe('INV-20260101-000002');
    });

    it('rejects guest order link when email does not match', async () => {
      Order.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'order3',
            buyer: 'shopperD',
            invoiceNumber: 'INV-20260101-000003',
            billingDetails: { email: 'owner@example.com' },
            shippingDetails: { email: 'ship@example.com' },
          }),
        }),
      });

      const result = await validateOrderLink({
        orderInvoiceNumber: 'INV-20260101-000003',
        submitterEmail: 'stranger@example.com',
      });

      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.message).toBe('The order reference could not be verified.');
    });
  });

  describe('createCustomerEnquiry', () => {
    it('rejects contact enquiry without subject', async () => {
      const result = await createCustomerEnquiry({
        source: 'contact',
        message: 'This is a valid message for contact.',
        submitter: { name: 'Jane', email: 'jane@example.com' },
      });

      expect(result.invalid).toBe(true);
      expect(result.message).toMatch(/Subject is required/);
    });

    it('rejects well-wisher without category', async () => {
      const result = await createCustomerEnquiry({
        source: 'well-wisher',
        message: 'This is a valid well-wisher message.',
        submitter: { name: 'Jane', email: 'jane@example.com' },
      });

      expect(result.invalid).toBe(true);
      expect(result.message).toMatch(/Category is required/);
    });
  });
});
