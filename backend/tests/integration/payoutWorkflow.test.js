const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

// Mock auth middleware
jest.mock('../../middleware/verifySeller', () => (req, res, next) => {
    const mongoose = require('mongoose');
    req.user = { _id: new mongoose.Types.ObjectId(req.headers['x-test-seller-id']), role: 'seller' };
    next();
});
jest.mock('../../middleware/verifyAdmin', () => (req, res, next) => {
    const mongoose = require('mongoose');
    req.user = { _id: new mongoose.Types.ObjectId(), role: 'admin' };
    next();
});

const app = require('../helpers/testApp');
const Payout = require('../../models/Payout');
const SellerLedger = require('../../models/SellerLedger');
const Commission = require('../../models/Commission');
const Seller = require('../../models/Seller');

let mongoServer;

beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    mongoServer = await MongoMemoryReplSet.create({
        replSet: { count: 1, name: 'rs0', storageEngine: 'wiredTiger' }
    });
    const uri = mongoServer.getUri();
    process.stderr.write(`🔗 MongoDB Test URI: ${uri}\n`);
    await mongoose.connect(uri);

    // Explicitly create collections
    await Commission.createCollection();
    await Payout.createCollection();
    await SellerLedger.createCollection();
    await Seller.createCollection();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

describe('Payout Workflow Integration Tests', () => {
    let sellerId;
    let sellerToken = 'mock-token';

    beforeEach(async () => {
        await Seller.deleteMany({});
        await Commission.deleteMany({});
        await SellerLedger.deleteMany({});
        await Payout.deleteMany({});

        const seller = await Seller.create({
            firstName: 'Test',
            lastName: 'Seller',
            email: 'seller@test.com',
            username: 'testseller',
            password: 'password123',
            phone: '1234567890',
            shopName: 'Test Shop',
            shopUrl: 'test-shop',
            bankAccount: {
                accountNumber: '1234567890',
                accountNumberConfirm: '1234567890',
                ifscCode: 'SBIN0001234'
            }
        });
        sellerId = seller._id;

        // Create initial ledger entry
        await SellerLedger.create({
            seller: sellerId,
            type: 'commission_earned',
            amount: 5000,
            balanceAfter: 5000,
            description: 'Initial funds'
        });

        // Create approved commissions
        const mockOrderId = new mongoose.Types.ObjectId();
        const mockProductId = new mongoose.Types.ObjectId();
        await Commission.create([
            {
                seller: sellerId,
                product: mockProductId,
                order: mockOrderId,
                commissionRate: 5,
                commissionAmount: 2000,
                status: 'approved',
                appliedRule: 'system_default',
                orderAmount: 40000,
                period: { month: 2, year: 2026 }
            },
            {
                seller: sellerId,
                product: mockProductId,
                order: mockOrderId,
                commissionRate: 5,
                commissionAmount: 3000,
                status: 'approved',
                appliedRule: 'system_default',
                orderAmount: 60000,
                period: { month: 2, year: 2026 }
            }
        ]);

        // Wait for indexes and writes to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    test('Should complete full payout lifecycle: Request -> Approve -> Pay', async () => {
        // 1. Request Payout
        const res = await request(app)
            .post('/api/seller/payouts/request')
            .set('Authorization', `Bearer ${sellerToken}`)
            .set('x-test-seller-id', sellerId.toString())
            .send({ amount: 3000, paymentMethod: 'bank_transfer', notes: 'Need money' });

        if (res.status !== 201) {
            console.error('Request Payout Failed:', JSON.stringify(res.body, null, 2));
        }
        expect(res.status).toBe(201);
        const payoutId = res.body.data.payout._id;

        // Verify Ledger (Deduction)
        const ledger = await SellerLedger.findOne({ seller: sellerId }).sort({ createdAt: -1 });
        expect(ledger.amount).toBe(-3000);
        expect(ledger.balanceAfter).toBe(2000);

        // Verify Commissions Locked
        const lockedCount = await Commission.countDocuments({ seller: sellerId, status: 'locked', lockedBy: payoutId });
        expect(lockedCount).toBeGreaterThan(0);

        // 2. Admin Approve
        const approveRes = await request(app)
            .post(`/api/admin/payouts/${payoutId}/approve`)
            .set('Authorization', 'Bearer admin-token')
            .send();

        expect(approveRes.status).toBe(200);
        const payoutPostApprove = await Payout.findById(payoutId);
        expect(payoutPostApprove.status).toBe('approved');

        // 3. Admin Mark as Paid
        const payRes = await request(app)
            .post(`/api/admin/payouts/${payoutId}/pay`)
            .set('Authorization', 'Bearer admin-token')
            .send({ transactionReference: 'TXN123456' });

        expect(payRes.status).toBe(200);
        const payoutFinal = await Payout.findById(payoutId);
        expect(payoutFinal.status).toBe('paid');
        expect(payoutFinal.transactionReference).toBe('TXN123456');

        // Verify Commissions marked as paid
        const paidCommissions = await Commission.countDocuments({ lockedBy: payoutId, status: 'paid' });
        expect(paidCommissions).toBeGreaterThan(0);
    });

    test('Should handle Payout Rejection and refund funds', async () => {
        // 1. Request Payout
        const res = await request(app)
            .post('/api/seller/payouts/request')
            .set('Authorization', `Bearer ${sellerToken}`)
            .set('x-test-seller-id', sellerId.toString())
            .send({ amount: 2000, paymentMethod: 'bank_transfer' });

        expect(res.status).toBe(201);
        const payoutId = res.body.data.payout._id;

        // 2. Admin Reject
        const rejectRes = await request(app)
            .post(`/api/admin/payouts/${payoutId}/reject`)
            .set('Authorization', 'Bearer admin-token')
            .send({ reason: 'Incorrect details' });

        expect(rejectRes.status).toBe(200);

        // Verify Ledger (Refund)
        const latestLedger = await SellerLedger.findOne({ seller: sellerId }).sort({ createdAt: -1 });
        expect(latestLedger.type).toBe('payout_rejected');
        expect(latestLedger.amount).toBe(2000);
        expect(latestLedger.balanceAfter).toBe(5000);

        // Verify Commissions Unlocked (may be 3 if partial lock created a new commission record)
        const unlockedCount = await Commission.countDocuments({ seller: sellerId, status: 'approved' });
        expect(unlockedCount).toBeGreaterThanOrEqual(2);
    });
});
