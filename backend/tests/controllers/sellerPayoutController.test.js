const {
  getSellerPayoutSummary,
  addPaymentMethod,
  requestPayout,
  getPayoutHistory,
  updatePaymentMethod,
  deletePaymentMethod
} = require('../../controllers/sellerPayoutController');

const Commission = require('../../models/Commission');
const Seller = require('../../models/Seller');
const { sendErrorResponse, sendSuccessResponse } = require('../../utils/errorHandler');

// Mock the models and utilities
jest.mock('../../models/Commission');
jest.mock('../../models/Seller');
jest.mock('../../utils/errorHandler');

describe('SellerPayoutController', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      user: { _id: 'seller123' },
      params: {},
      query: {},
      body: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getSellerPayoutSummary', () => {
    it('should return seller payout summary successfully', async () => {
      const mockSeller = {
        _id: 'seller123',
        paymentMethods: [
          { type: 'bank_transfer', details: { accountNumber: '1234567890' } }
        ],
        bankAccount: { accountNumber: '1234567890' }
      };

      const mockCommissionSummary = [
        { _id: 'pending', count: 2, totalAmount: 100 },
        { _id: 'approved', count: 3, totalAmount: 200 },
        { _id: 'paid', count: 5, totalAmount: 300 }
      ];

      Seller.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockSeller)
      });

      Commission.aggregate.mockResolvedValue(mockCommissionSummary);

      await getSellerPayoutSummary(mockReq, mockRes);

      expect(Seller.findById).toHaveBeenCalledWith('seller123');
      expect(Commission.aggregate).toHaveBeenCalled();
      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        200,
        'Seller payout summary retrieved successfully',
        expect.objectContaining({
          availableForPayout: 200,
          totalEarnings: 300,
          commissionSummary: expect.any(Object),
          paymentMethods: mockSeller.paymentMethods,
          bankAccount: mockSeller.bankAccount,
          lastUpdated: expect.any(String)
        })
      );
    });

    it('should handle missing seller ID', async () => {
      mockReq.user = {};

      await getSellerPayoutSummary(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid seller ID',
        timestamp: expect.any(String)
      });
    });

    it('should handle seller not found', async () => {
      Seller.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      await getSellerPayoutSummary(mockReq, mockRes);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        404,
        'Seller not found',
        'RESOURCE_NOT_FOUND'
      );
    });
  });

  describe('addPaymentMethod', () => {
    it('should add bank transfer payment method successfully', async () => {
      const mockSeller = {
        _id: 'seller123',
        paymentMethods: [],
        save: jest.fn().mockResolvedValue(true)
      };

      mockReq.body = {
        type: 'bank_transfer',
        details: {
          accountNumber: '1234567890',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'John Doe',
          bankName: 'State Bank of India'
        }
      };

      Seller.findById.mockResolvedValue(mockSeller);

      await addPaymentMethod(mockReq, mockRes);

      expect(Seller.findById).toHaveBeenCalledWith('seller123');
      expect(mockSeller.paymentMethods).toHaveLength(1);
      expect(mockSeller.paymentMethods[0].type).toBe('bank_transfer');
      expect(mockSeller.save).toHaveBeenCalled();
      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        201,
        'Payment method added successfully',
        expect.objectContaining({
          paymentMethod: expect.any(Object)
        })
      );
    });

    it('should add UPI payment method successfully', async () => {
      const mockSeller = {
        _id: 'seller123',
        paymentMethods: [],
        save: jest.fn().mockResolvedValue(true)
      };

      mockReq.body = {
        type: 'upi',
        details: {
          upiId: 'john@paytm'
        }
      };

      Seller.findById.mockResolvedValue(mockSeller);

      await addPaymentMethod(mockReq, mockRes);

      expect(mockSeller.paymentMethods[0].type).toBe('upi');
      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        201,
        'Payment method added successfully',
        expect.any(Object)
      );
    });

    it('should handle invalid payment method type', async () => {
      mockReq.body = {
        type: 'invalid_type',
        details: {}
      };

      await addPaymentMethod(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid payment method type',
        timestamp: expect.any(String)
      });
    });

    it('should handle missing required fields', async () => {
      mockReq.body = {
        type: 'bank_transfer'
        // Missing details
      };

      await addPaymentMethod(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Payment method type and details are required',
        timestamp: expect.any(String)
      });
    });
  });

  describe('requestPayout', () => {
    it('should process payout request successfully', async () => {
      const mockSeller = {
        _id: 'seller123',
        paymentMethods: [
          {
            _id: 'payment123',
            type: 'bank_transfer',
            details: { accountNumber: '1234567890' }
          }
        ]
      };

      const mockCommissions = [
        { _id: null, total: 500 }
      ];

      mockReq.body = {
        amount: 200,
        paymentMethodId: 'payment123',
        notes: 'Test payout'
      };

      Seller.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockSeller)
      });

      Commission.aggregate.mockResolvedValue(mockCommissions);

      await requestPayout(mockReq, mockRes);

      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        201,
        'Payout request submitted successfully',
        expect.objectContaining({
          payoutRequest: expect.any(Object)
        })
      );
    });

    it('should handle insufficient balance', async () => {
      const mockSeller = {
        _id: 'seller123',
        paymentMethods: [
          {
            _id: 'payment123',
            type: 'bank_transfer',
            details: { accountNumber: '1234567890' }
          }
        ]
      };

      const mockCommissions = [
        { _id: null, total: 100 }
      ];

      mockReq.body = {
        amount: 200, // More than available balance
        paymentMethodId: 'payment123'
      };

      Seller.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockSeller)
      });

      Commission.aggregate.mockResolvedValue(mockCommissions);

      await requestPayout(mockReq, mockRes);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        400,
        'Insufficient balance. Available: ₹100',
        'INVALID_INPUT'
      );
    });

    it('should handle no payment methods', async () => {
      const mockSeller = {
        _id: 'seller123',
        paymentMethods: []
      };

      mockReq.body = {
        amount: 200,
        paymentMethodId: 'payment123'
      };

      Seller.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockSeller)
      });

      await requestPayout(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'No payment methods found. Please add a payment method first',
        timestamp: expect.any(String)
      });
    });
  });

  describe('getPayoutHistory', () => {
    it('should return payout history successfully', async () => {
      const mockCommissions = [
        {
          _id: 'commission123',
          commissionAmount: 100,
          updatedAt: new Date(),
          order: { orderNumber: 'ORD123' },
          product: { name: 'Test Product' }
        }
      ];

      Commission.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                skip: jest.fn().mockResolvedValue(mockCommissions)
              })
            })
          })
        })
      });

      Commission.countDocuments.mockResolvedValue(1);

      await getPayoutHistory(mockReq, mockRes);

      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        200,
        'Payout history retrieved successfully',
        expect.objectContaining({
          payouts: expect.any(Array),
          pagination: expect.any(Object)
        })
      );
    });
  });

  describe('updatePaymentMethod', () => {
    it('should update payment method successfully', async () => {
      const mockSeller = {
        _id: 'seller123',
        paymentMethods: [
          {
            _id: 'payment123',
            type: 'bank_transfer',
            details: { accountNumber: '1234567890' },
            isDefault: false
          }
        ],
        save: jest.fn().mockResolvedValue(true)
      };

      mockReq.params = { paymentMethodId: 'payment123' };
      mockReq.body = {
        details: { accountNumber: '9876543210' },
        isDefault: true
      };

      Seller.findById.mockResolvedValue(mockSeller);

      await updatePaymentMethod(mockReq, mockRes);

      expect(mockSeller.paymentMethods[0].details.accountNumber).toBe('9876543210');
      expect(mockSeller.paymentMethods[0].isDefault).toBe(true);
      expect(mockSeller.save).toHaveBeenCalled();
      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        200,
        'Payment method updated successfully',
        expect.any(Object)
      );
    });
  });

  describe('deletePaymentMethod', () => {
    it('should delete payment method successfully', async () => {
      const mockSeller = {
        _id: 'seller123',
        paymentMethods: [
          {
            _id: 'payment123',
            type: 'bank_transfer',
            isDefault: true
          },
          {
            _id: 'payment456',
            type: 'upi',
            isDefault: false
          }
        ],
        save: jest.fn().mockResolvedValue(true)
      };

      mockReq.params = { paymentMethodId: 'payment123' };

      Seller.findById.mockResolvedValue(mockSeller);

      await deletePaymentMethod(mockReq, mockRes);

      expect(mockSeller.paymentMethods).toHaveLength(1);
      expect(mockSeller.paymentMethods[0].isDefault).toBe(true); // Second method becomes default
      expect(mockSeller.save).toHaveBeenCalled();
      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        200,
        'Payment method deleted successfully',
        expect.any(Object)
      );
    });

    it('should prevent deleting the only payment method', async () => {
      const mockSeller = {
        _id: 'seller123',
        paymentMethods: [
          {
            _id: 'payment123',
            type: 'bank_transfer',
            isDefault: true
          }
        ]
      };

      mockReq.params = { paymentMethodId: 'payment123' };

      Seller.findById.mockResolvedValue(mockSeller);

      await deletePaymentMethod(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Cannot delete the only payment method',
        timestamp: expect.any(String)
      });
    });
  });
});
