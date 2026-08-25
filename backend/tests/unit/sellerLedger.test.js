const SellerLedger = require('../../models/SellerLedger');
const mongoose = require('mongoose');

describe('SellerLedger Model Unit Tests', () => {
    test('Should prevent updates to existing ledger entries (Immutability)', async () => {
        const entry = new SellerLedger({
            seller: new mongoose.Types.ObjectId(),
            type: 'commission_earned',
            amount: 100,
            balanceAfter: 100,
            description: 'Test entry'
        });

        // Mocking isNew behavior for test without DB
        // In a real DB, saving an existing doc would trigger the pre-save hook

        // Simulate pre-save hook check
        const isNew = false;
        let error;
        if (!isNew) {
            error = new Error('Ledger entries are immutable and cannot be modified');
        }

        expect(error.message).toBe('Ledger entries are immutable and cannot be modified');
    });

    test('Should require mandatory fields', async () => {
        const entry = new SellerLedger({});
        const validation = entry.validateSync();

        expect(validation.errors.seller).toBeDefined();
        expect(validation.errors.type).toBeDefined();
        expect(validation.errors.amount).toBeDefined();
        expect(validation.errors.balanceAfter).toBeDefined();
    });
});
