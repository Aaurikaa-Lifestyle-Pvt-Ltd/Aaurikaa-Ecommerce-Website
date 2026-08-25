const mongoose = require('mongoose');
const { createOrderWithBulkDiscounts } = require('../../services/orderProcessingService');
const Product = require('../../models/Product');
const Coupon = require('../../models/coupon');
const ShippingZone = require('../../models/ShippingZone');
const WeightClass = require('../../models/WeightClass');
const FlatShippingRule = require('../../models/FlatShippingRule');
const State = require('../../models/location/State');
const Country = require('../../models/location/Country');
const Order = require('../../models/Order');

describe('End-to-End Checkout Flow (Backend Service)', () => {
    let testProduct, testState, testCountry, testZone, testWeightClass;

    beforeAll(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test_db');
        }
    });

    afterAll(async () => {
        await mongoose.connection.close();
    });

    beforeEach(async () => {
        await Product.deleteMany({});
        await Coupon.deleteMany({});
        await ShippingZone.deleteMany({});
        await WeightClass.deleteMany({});
        await FlatShippingRule.deleteMany({});
        await State.deleteMany({});
        await Country.deleteMany({});
        await Order.deleteMany({});

        // 1. Setup Logistics
        testCountry = await Country.create({ name: 'India', code: 'IN' });
        testState = await State.create({ name: 'Maharashtra', country: testCountry._id });

        testZone = await ShippingZone.create({
            name: 'West India',
            code: 'WEST',
            country: 'IN',
            states: ['Maharashtra'],
            active: true
        });

        testWeightClass = await WeightClass.create({
            name: 'Medium',
            minWeightG: 500,
            maxWeightG: 2000,
            active: true,
            sortOrder: 1
        });

        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: testWeightClass._id,
            rateINR: 75,
            active: true
        });

        // 2. Setup Product
        testProduct = await Product.create({
            name: 'Smart Watch',
            sku: 'WATCH-123',
            regularPrice: 2000,
            salePrice: 1800,
            weight: 600, // Matches Medium slab
            stock: 50,
            shippingType: 'inherit'
        });
    });

    it('should place an order with correct shipping, tax, and bulk discount snapshots', async () => {
        const buyerId = new mongoose.Types.ObjectId();

        const orderData = {
            items: [
                {
                    product: testProduct._id,
                    quantity: 1
                }
            ],
            shippingAddress: {
                name: 'Jane Doe',
                email: 'jane@example.com',
                phone: '9876543210',
                street: '123 Test Lane',
                city: 'Mumbai',
                stateId: testState._id,
                countryId: testCountry._id,
                zip: '400001'
            },
            billingAddress: {
                name: 'Jane Doe'
            },
            buyer: buyerId,
            paymentMethod: 'cod'
        };

        const result = await createOrderWithBulkDiscounts(orderData);

        expect(result.success).toBe(true);
        const order = result.order;

        // Financial Validation
        // Base Item: 1800
        // Shipping: 75
        // Tax: 18% of 1800 = 324 (Service uses 18% GST by default)
        // Total: 1800 + 75 + 324 = 2199

        expect(order.totalAmount).toBe(2199);
        expect(order.shippingCharge).toBe(75);
        expect(order.shippingMethod).toBe('flat');
        expect(order.shippingZoneSnapshot.name).toBe('West India');
        expect(order.tax.totalTaxAmount).toBe(324);

        // Items snapshot validation
        expect(order.items[0].price).toBe(1800);
        expect(order.items[0].originalPrice).toBe(1800);
    });
});
