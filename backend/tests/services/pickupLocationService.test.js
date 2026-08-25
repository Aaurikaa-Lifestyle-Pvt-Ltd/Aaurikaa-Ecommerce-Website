const mongoose = require('mongoose');
const pickupLocationService = require('../../services/pickupLocationService');
const SellerPickupLocation = require('../../models/SellerPickupLocation');
const Seller = require('../../models/Seller');

describe('PickupLocationService', () => {
    let testSeller, testPickup;

    beforeAll(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test_db');
        }
    });

    afterAll(async () => {
        await mongoose.connection.close();
    });

    beforeEach(async () => {
        await SellerPickupLocation.deleteMany({});
        await Seller.deleteMany({});

        // Create a test pickup location
        testPickup = await SellerPickupLocation.create({
            shiprocketId: 12345,
            name: 'Main Warehouse',
            address: {
                address: '123 Test St',
                city: 'Kolkata',
                state: 'West Bengal',
                pincode: '700001'
            },
            isActive: true,
            isDefault: true
        });

        // Create a test seller
        testSeller = await Seller.create({
            username: 'testseller',
            email: 'seller@test.com',
            shopName: 'Test Shop'
        });
    });

    it('should resolve to default pickup if seller has no assignment', async () => {
        const resolved = await pickupLocationService.resolvePickupForSeller(testSeller._id);
        expect(resolved).toBeDefined();
        expect(resolved._id.toString()).toBe(testPickup._id.toString());
        expect(resolved.isDefault).toBe(true);
    });

    it('should resolve to seller specific pickup if assigned', async () => {
        const sellerPickup = await SellerPickupLocation.create({
            shiprocketId: 67890,
            name: 'Seller Branch',
            address: { address: '456 Seller Rd', city: 'Mumbai', pincode: '400001' },
            seller: testSeller._id,
            isActive: true
        });

        testSeller.pickupLocation = sellerPickup._id;
        await testSeller.save();

        const resolved = await pickupLocationService.resolvePickupForSeller(testSeller._id);
        expect(resolved).toBeDefined();
        expect(resolved._id.toString()).toBe(sellerPickup._id.toString());
        expect(resolved.shiprocketId).toBe(67890);
    });

    it('should fall back to default if assigned pickup is inactive', async () => {
        const sellerPickup = await SellerPickupLocation.create({
            shiprocketId: 67890,
            name: 'Seller Branch',
            address: { address: '456 Seller Rd', city: 'Mumbai', pincode: '400001' },
            seller: testSeller._id,
            isActive: false
        });

        testSeller.pickupLocation = sellerPickup._id;
        await testSeller.save();

        const resolved = await pickupLocationService.resolvePickupForSeller(testSeller._id);
        expect(resolved._id.toString()).toBe(testPickup._id.toString());
    });
});
