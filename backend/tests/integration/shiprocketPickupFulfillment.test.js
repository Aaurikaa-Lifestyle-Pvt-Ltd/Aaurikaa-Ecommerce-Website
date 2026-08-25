const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');
const SellerPickupLocation = require('../../models/SellerPickupLocation');
const { updateOrderStatus } = require('../../controllers/sellerOrderController');

const app = express();
app.use(express.json());

// Mock middleware to simulate authenticated seller
const mockVerifySeller = (req, res, next) => {
    // Take seller ID from header for dynamic switching in tests
    const sellerId = req.headers['x-test-seller-id'];
    if (sellerId) {
        req.user = { _id: sellerId };
    }
    next();
};

app.put('/api/orders/seller/:orderId/status', mockVerifySeller, updateOrderStatus);

describe('Seller Order Fulfillment Integration (Shiprocket Pickup)', () => {
    let seller, product, order, pickup;

    beforeAll(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test_db');
        }
    });

    afterAll(async () => {
        await mongoose.connection.close();
    });

    beforeEach(async () => {
        await Order.deleteMany({});
        await Product.deleteMany({});
        await Seller.deleteMany({});
        await SellerPickupLocation.deleteMany({});

        // 1. Create Seller
        seller = await Seller.create({
            username: 'ship_seller',
            email: 'ship@seller.com',
            shopName: 'Ship Shop',
            role: 'seller',
            isApproved: true
        });

        // 2. Create Product
        product = await Product.create({
            name: 'Cargo Pants',
            sku: 'CARGO-1',
            regularPrice: 1200,
            seller: seller._id
        });

        // 3. Create Order
        order = await Order.create({
            buyer: new mongoose.Types.ObjectId(),
            items: [{
                product: product._id,
                quantity: 1,
                price: 1200,
                originalPrice: 1200
            }],
            totalAmount: 1200,
            shippingProvider: 'shiprocket',
            status: 'processing',
            invoiceNumber: 'INV-TEST-001'
        });
    });

    it('should fail to mark order as shipped if no pickup location is configured', async () => {
        const res = await request(app)
            .put(`/api/orders/seller/${order._id}/status`)
            .set('x-test-seller-id', seller._id.toString())
            .send({ status: 'shipped' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('PICKUP_NOT_CONFIGURED');
    });

    it('should succeed to mark as shipped if pickup location is assigned to seller', async () => {
        pickup = await SellerPickupLocation.create({
            shiprocketId: 999,
            name: 'Seller Warehouse',
            address: { address: 'Delhi', pincode: '110001' },
            seller: seller._id,
            isActive: true
        });

        seller.pickupLocation = pickup._id;
        await seller.save();

        const res = await request(app)
            .put(`/api/orders/seller/${order._id}/status`)
            .set('x-test-seller-id', seller._id.toString())
            .send({ status: 'shipped', trackingNumber: 'AWB123' });

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('updated successfully');
    });

    it('should succeed to mark as shipped if platform default pickup is configured', async () => {
        // No assignment to seller, but a platform default exists
        await SellerPickupLocation.create({
            shiprocketId: 1,
            name: 'Main Hub',
            address: { address: 'Mumbai', pincode: '400001' },
            isActive: true,
            isDefault: true
        });

        const res = await request(app)
            .put(`/api/orders/seller/${order._id}/status`)
            .set('x-test-seller-id', seller._id.toString())
            .send({ status: 'shipped', trackingNumber: 'AWB123' });

        expect(res.status).toBe(200);
    });
});
