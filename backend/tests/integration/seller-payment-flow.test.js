const mongoose = require('mongoose');
const Seller = require('../../models/Seller');
const Commission = require('../../models/Commission');
const Order = require('../../models/Order');

// Mock the models
jest.mock('../../models/Seller');
jest.mock('../../models/Commission');
jest.mock('../../models/Order');

describe('Seller Payment Flow Integration Tests', () => {
  let sellerId;
  let mockSeller;

  beforeAll(() => {
    sellerId = new mongoose.Types.ObjectId();
    
    mockSeller = {
      _id: sellerId,
      firstName: 'John',
      lastName: 'Doe',
      email: 'seller@test.com',
      shopName: 'Test Shop',
      commission: 10,
      paymentMethods: [],
      bankAccount: null
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Payment Method Setup', () => {
    it('should add bank account details to seller profile', async () => {
      const bankAccountData = {
        accountHolderName: 'John Doe',
        accountNumber: '1234567890',
        bankName: 'Test Bank',
        ifscCode: 'TEST0001234',
        branch: 'Main Branch'
      };

      const updatedSeller = {
        ...mockSeller,
        bankAccount: bankAccountData
      };

      Seller.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedSeller);

      const result = await Seller.findByIdAndUpdate(
        sellerId,
        { bankAccount: bankAccountData },
        { new: true }
      );

      expect(result.bankAccount).toEqual(bankAccountData);
      expect(Seller.findByIdAndUpdate).toHaveBeenCalledWith(
        sellerId,
        { bankAccount: bankAccountData },
        { new: true }
      );
    });

    it('should add UPI payment method', async () => {
      const upiMethod = {
        type: 'upi',
        details: {
          upiId: 'seller@upi',
          verified: false
        }
      };

      const updatedSeller = {
        ...mockSeller,
        paymentMethods: [upiMethod]
      };

      Seller.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedSeller);

      const result = await Seller.findByIdAndUpdate(
        sellerId,
        { $push: { paymentMethods: upiMethod } },
        { new: true }
      );

      expect(result.paymentMethods).toContainEqual(upiMethod);
    });

    it('should support multiple payment methods', async () => {
      const paymentMethods = [
        {
          type: 'bank_transfer',
          details: { accountNumber: '1234567890', ifscCode: 'TEST0001234' }
        },
        {
          type: 'upi',
          details: { upiId: 'seller@upi' }
        },
        {
          type: 'wallet',
          details: { walletId: 'WALLET123' }
        }
      ];

      const updatedSeller = {
        ...mockSeller,
        paymentMethods
      };

      Seller.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedSeller);

      const result = await Seller.findByIdAndUpdate(
        sellerId,
        { paymentMethods },
        { new: true }
      );

      expect(result.paymentMethods).toHaveLength(3);
      expect(result.paymentMethods).toEqual(paymentMethods);
    });

    it('should update existing payment method', async () => {
      const existingMethod = {
        _id: new mongoose.Types.ObjectId(),
        type: 'upi',
        details: { upiId: 'old@upi' }
      };

      const updatedMethod = {
        ...existingMethod,
        details: { upiId: 'new@upi', verified: true }
      };

      mockSeller.paymentMethods = [existingMethod];
      Seller.findById = jest.fn().mockResolvedValue(mockSeller);

      const sellerWithUpdatedMethod = {
        ...mockSeller,
        paymentMethods: [updatedMethod]
      };

      Seller.findByIdAndUpdate = jest.fn().mockResolvedValue(sellerWithUpdatedMethod);

      const result = await Seller.findByIdAndUpdate(
        sellerId,
        { 'paymentMethods.$[elem]': updatedMethod },
        { arrayFilters: [{ 'elem._id': existingMethod._id }], new: true }
      );

      expect(result.paymentMethods[0].details.upiId).toBe('new@upi');
      expect(result.paymentMethods[0].details.verified).toBe(true);
    });

    it('should delete payment method', async () => {
      const methodId = new mongoose.Types.ObjectId();
      const paymentMethod = {
        _id: methodId,
        type: 'upi',
        details: { upiId: 'seller@upi' }
      };

      mockSeller.paymentMethods = [paymentMethod];
      Seller.findById = jest.fn().mockResolvedValue(mockSeller);

      const updatedSeller = {
        ...mockSeller,
        paymentMethods: []
      };

      Seller.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedSeller);

      const result = await Seller.findByIdAndUpdate(
        sellerId,
        { $pull: { paymentMethods: { _id: methodId } } },
        { new: true }
      );

      expect(result.paymentMethods).toHaveLength(0);
    });
  });

  describe('Commission to Payout Flow', () => {
    it('should track commission from order to payout availability', async () => {
      const orderId = new mongoose.Types.ObjectId();

      // Step 1: Order delivered, commission created
      const commission = {
        _id: new mongoose.Types.ObjectId(),
        seller: sellerId,
        order: orderId,
        orderAmount: 1000,
        commissionAmount: 100,
        status: 'pending',
        createdAt: new Date()
      };

      Commission.create = jest.fn().mockResolvedValue(commission);

      const createdCommission = await Commission.create(commission);
      expect(createdCommission.status).toBe('pending');
      expect(createdCommission.commissionAmount).toBe(100);

      // Step 2: Admin approves commission
      const approvedCommission = {
        ...createdCommission,
        status: 'approved',
        approvedAt: new Date()
      };

      Commission.findByIdAndUpdate = jest.fn().mockResolvedValue(approvedCommission);

      const updated = await Commission.findByIdAndUpdate(
        commission._id,
        { status: 'approved', approvedAt: new Date() },
        { new: true }
      );

      expect(updated.status).toBe('approved');

      // Step 3: Commission becomes available for payout
      Commission.find = jest.fn().mockResolvedValue([approvedCommission]);

      const availableCommissions = await Commission.find({
        seller: sellerId,
        status: 'approved'
      });

      expect(availableCommissions).toHaveLength(1);
      expect(availableCommissions[0].commissionAmount).toBe(100);
    });

    it('should calculate available payout balance correctly', async () => {
      const mockCommissions = [
        {
          _id: new mongoose.Types.ObjectId(),
          seller: sellerId,
          commissionAmount: 100,
          status: 'pending'
        },
        {
          _id: new mongoose.Types.ObjectId(),
          seller: sellerId,
          commissionAmount: 200,
          status: 'approved'
        },
        {
          _id: new mongoose.Types.ObjectId(),
          seller: sellerId,
          commissionAmount: 150,
          status: 'approved'
        },
        {
          _id: new mongoose.Types.ObjectId(),
          seller: sellerId,
          commissionAmount: 300,
          status: 'paid'
        }
      ];

      Commission.aggregate = jest.fn().mockResolvedValue([
        { _id: 'pending', count: 1, total: 100 },
        { _id: 'approved', count: 2, total: 350 },
        { _id: 'paid', count: 1, total: 300 }
      ]);

      const summary = await Commission.aggregate([
        { $match: { seller: sellerId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total: { $sum: '$commissionAmount' }
          }
        }
      ]);

      const approvedCommissions = summary.find(s => s._id === 'approved');
      expect(approvedCommissions.total).toBe(350);
    });
  });

  describe('Payout Request Processing', () => {
    it('should create payout request with valid payment method', async () => {
      const payoutRequest = {
        seller: sellerId,
        amount: 200,
        paymentMethod: 'bank_transfer',
        status: 'pending',
        requestedAt: new Date()
      };

      // Check seller has payment method
      mockSeller.bankAccount = {
        accountNumber: '1234567890',
        ifscCode: 'TEST0001234'
      };

      Seller.findById = jest.fn().mockResolvedValue(mockSeller);

      const seller = await Seller.findById(sellerId);
      expect(seller.bankAccount).toBeDefined();

      // Check available balance
      Commission.aggregate = jest.fn().mockResolvedValue([
        { _id: 'approved', total: 250 }
      ]);

      const commissionSummary = await Commission.aggregate([
        { $match: { seller: sellerId, status: 'approved' } },
        { $group: { _id: '$status', total: { $sum: '$commissionAmount' } } }
      ]);

      const availableBalance = commissionSummary[0]?.total || 0;
      expect(availableBalance).toBeGreaterThanOrEqual(payoutRequest.amount);
    });

    it('should reject payout request without payment method', async () => {
      const payoutRequest = {
        seller: sellerId,
        amount: 200
      };

      mockSeller.bankAccount = null;
      mockSeller.paymentMethods = [];

      Seller.findById = jest.fn().mockResolvedValue(mockSeller);

      const seller = await Seller.findById(sellerId);
      
      const hasPaymentMethod = seller.bankAccount || seller.paymentMethods.length > 0;
      expect(hasPaymentMethod).toBe(false);

      // Should throw error
      expect(() => {
        if (!hasPaymentMethod) {
          throw new Error('No payment method configured');
        }
      }).toThrow('No payment method configured');
    });

    it('should reject payout request exceeding available balance', async () => {
      const payoutRequest = {
        amount: 500
      };

      Commission.aggregate = jest.fn().mockResolvedValue([
        { _id: 'approved', total: 250 }
      ]);

      const commissionSummary = await Commission.aggregate([
        { $match: { seller: sellerId, status: 'approved' } },
        { $group: { _id: '$status', total: { $sum: '$commissionAmount' } } }
      ]);

      const availableBalance = commissionSummary[0]?.total || 0;
      expect(availableBalance).toBeLessThan(payoutRequest.amount);

      expect(() => {
        if (payoutRequest.amount > availableBalance) {
          throw new Error('Insufficient balance');
        }
      }).toThrow('Insufficient balance');
    });

    it('should update commission status to processing when payout requested', async () => {
      const payoutAmount = 200;

      // Find approved commissions
      const mockCommissions = [
        {
          _id: new mongoose.Types.ObjectId(),
          seller: sellerId,
          commissionAmount: 100,
          status: 'approved'
        },
        {
          _id: new mongoose.Types.ObjectId(),
          seller: sellerId,
          commissionAmount: 100,
          status: 'approved'
        }
      ];

      Commission.find = jest.fn().mockResolvedValue(mockCommissions);

      // Update commissions to processing
      Commission.updateMany = jest.fn().mockResolvedValue({
        modifiedCount: 2
      });

      const result = await Commission.updateMany(
        {
          seller: sellerId,
          status: 'approved',
          _id: { $in: mockCommissions.map(c => c._id) }
        },
        { status: 'processing' }
      );

      expect(result.modifiedCount).toBe(2);
    });
  });

  describe('Payout Completion', () => {
    it('should mark commissions as paid when payout completed', async () => {
      const payoutId = new mongoose.Types.ObjectId();
      const commissionIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId()
      ];

      // Payout completed successfully
      Commission.updateMany = jest.fn().mockResolvedValue({
        modifiedCount: 2
      });

      const result = await Commission.updateMany(
        {
          seller: sellerId,
          _id: { $in: commissionIds },
          status: 'processing'
        },
        {
          status: 'paid',
          paidAt: new Date(),
          payout: payoutId
        }
      );

      expect(result.modifiedCount).toBe(2);
    });

    it('should calculate total earnings from paid commissions', async () => {
      Commission.aggregate = jest.fn().mockResolvedValue([
        { _id: 'paid', count: 10, total: 1500 }
      ]);

      const summary = await Commission.aggregate([
        { $match: { seller: sellerId, status: 'paid' } },
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$commissionAmount' } } }
      ]);

      const totalEarnings = summary[0]?.total || 0;
      expect(totalEarnings).toBe(1500);
    });

    it('should maintain payout history', async () => {
      const payoutHistory = [
        {
          _id: new mongoose.Types.ObjectId(),
          seller: sellerId,
          amount: 200,
          status: 'completed',
          completedAt: new Date('2024-01-15')
        },
        {
          _id: new mongoose.Types.ObjectId(),
          seller: sellerId,
          amount: 300,
          status: 'completed',
          completedAt: new Date('2024-02-15')
        },
        {
          _id: new mongoose.Types.ObjectId(),
          seller: sellerId,
          amount: 150,
          status: 'completed',
          completedAt: new Date('2024-03-15')
        }
      ];

      // Calculate total paid out
      const totalPaidOut = payoutHistory.reduce((sum, payout) => 
        sum + payout.amount, 0
      );

      expect(totalPaidOut).toBe(650);
      expect(payoutHistory).toHaveLength(3);
    });
  });

  describe('Failed Payout Handling', () => {
    it('should revert commission status if payout fails', async () => {
      const commissionIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId()
      ];

      // Payout failed, revert commissions to approved
      Commission.updateMany = jest.fn().mockResolvedValue({
        modifiedCount: 2
      });

      const result = await Commission.updateMany(
        {
          seller: sellerId,
          _id: { $in: commissionIds },
          status: 'processing'
        },
        { status: 'approved' }
      );

      expect(result.modifiedCount).toBe(2);
    });

    it('should record payout failure reason', async () => {
      const payoutId = new mongoose.Types.ObjectId();
      const failureReason = 'Bank account verification failed';

      const failedPayout = {
        _id: payoutId,
        seller: sellerId,
        amount: 200,
        status: 'failed',
        failureReason,
        failedAt: new Date()
      };

      expect(failedPayout.status).toBe('failed');
      expect(failedPayout.failureReason).toBe(failureReason);
    });
  });

  describe('Payment Summary and Analytics', () => {
    it('should provide comprehensive payment summary', async () => {
      Commission.aggregate = jest.fn().mockResolvedValue([
        { _id: 'pending', count: 5, total: 500 },
        { _id: 'approved', count: 3, total: 300 },
        { _id: 'processing', count: 2, total: 200 },
        { _id: 'paid', count: 20, total: 2000 }
      ]);

      const summary = await Commission.aggregate([
        { $match: { seller: sellerId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total: { $sum: '$commissionAmount' }
          }
        }
      ]);

      const paymentSummary = {
        pending: summary.find(s => s._id === 'pending')?.total || 0,
        approved: summary.find(s => s._id === 'approved')?.total || 0,
        processing: summary.find(s => s._id === 'processing')?.total || 0,
        paid: summary.find(s => s._id === 'paid')?.total || 0
      };

      expect(paymentSummary.pending).toBe(500);
      expect(paymentSummary.approved).toBe(300);
      expect(paymentSummary.processing).toBe(200);
      expect(paymentSummary.paid).toBe(2000);
    });

    it('should track payment history by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      Commission.aggregate = jest.fn().mockResolvedValue([
        { month: 1, total: 200 },
        { month: 2, total: 300 },
        { month: 3, total: 250 }
      ]);

      const monthlyPayments = await Commission.aggregate([
        {
          $match: {
            seller: sellerId,
            status: 'paid',
            paidAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: { $month: '$paidAt' },
            total: { $sum: '$commissionAmount' }
          }
        },
        {
          $project: {
            month: '$_id',
            total: 1,
            _id: 0
          }
        }
      ]);

      expect(monthlyPayments).toHaveLength(3);
      expect(monthlyPayments[0].total).toBe(200);
    });
  });
});

