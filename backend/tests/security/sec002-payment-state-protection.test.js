/**
 * SEC-002 — paid must come from a trusted payment path, not seller status PUT.
 * Implemented via shared fulfilment transitions (no seller-authorization file changes).
 */
const {
  isAllowedStatusTransition,
  getAllowedTransitions,
} = require('../../utils/orderFulfillmentGuards');

const Order = require('../../models/Order');
const Product = require('../../models/Product');
const { sendSuccessResponse } = require('../../utils/errorHandler');

jest.mock('../../models/Order');
jest.mock('../../models/Product');
jest.mock('../../models/Commission');
jest.mock('../../models/SellerLedger');
jest.mock('../../models/ReturnRequest', () => ({
  find: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    }),
  }),
}));
jest.mock('../../utils/calculateCommission', () => ({ calculateCommission: jest.fn() }));
jest.mock('../../utils/financialIntegrityValidator', () => ({
  validateSellerLedgerIntegrity: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../services/orderFulfillmentService', () => ({
  maybeSyncShiprocket: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../utils/errorHandler', () => {
  const actual = jest.requireActual('../../utils/errorHandler');
  return {
    ...actual,
    asyncHandler: (fn) => fn,
    sendErrorResponse: jest.fn(actual.sendErrorResponse),
    sendSuccessResponse: jest.fn(actual.sendSuccessResponse),
  };
});

const { updateOrderStatus } = require('../../controllers/sellerOrderController');

describe('SEC-002 payment state protection', () => {
  it('does not allow pending → paid as a fulfilment transition', () => {
    const order = { shippingApplicability: 'full' };
    expect(isAllowedStatusTransition(order, 'pending', 'paid')).toBe(false);
    expect(getAllowedTransitions(order).pending).toEqual(['cancelled']);
  });

  it('rejects a seller attempt to mark an unpaid order paid', async () => {
    const mockProducts = [{ _id: 'product1' }];
    const mockOrder = {
      _id: 'order1',
      items: [{ product: 'product1', price: 100, quantity: 1 }],
      status: 'pending',
      paymentStatus: 'pending',
      shippingApplicability: 'full',
      save: jest.fn().mockResolvedValue(true),
    };

    Product.find = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(mockProducts),
    });
    Order.findById = jest.fn().mockResolvedValue(mockOrder);

    const req = {
      user: { _id: 'seller123' },
      params: { orderId: 'order1' },
      body: { status: 'paid' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await updateOrderStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockOrder.save).not.toHaveBeenCalled();
    expect(mockOrder.status).toBe('pending');
    expect(mockOrder.paymentStatus).toBe('pending');
    expect(sendSuccessResponse).not.toHaveBeenCalled();
  });
});
