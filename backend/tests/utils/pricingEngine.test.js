const mongoose = require('mongoose');
const { calculatePricing } = require('../../utils/pricingEngine');
const Product = require('../../models/Product');
const ShippingZone = require('../../models/ShippingZone');
const WeightClass = require('../../models/WeightClass');
const FlatShippingRule = require('../../models/FlatShippingRule');
const State = require('../../models/location/State');
const Country = require('../../models/location/Country');

describe('Unified Pricing Engine', () => {
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
        await ShippingZone.deleteMany({});
        await WeightClass.deleteMany({});
        await FlatShippingRule.deleteMany({});
        await State.deleteMany({});
        await Country.deleteMany({});

        testCountry = await Country.create({ name: 'India', code: 'IN' });
        testState = await State.create({ name: 'Delhi', country: testCountry._id });

        testZone = await ShippingZone.create({
            name: 'North India',
            code: 'NORTH',
            country: 'IN',
            states: ['Delhi'],
            active: true
        });

        testWeightClass = await WeightClass.create({
            name: 'Standard',
            minWeightG: 0,
            maxWeightG: 5000,
            active: true,
            sortOrder: 1
        });

        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: testWeightClass._id,
            rateINR: 40,
            active: true
        });

        testProduct = await Product.create({
            name: 'Gadget',
            sku: 'GDG-1',
            regularPrice: 1000,
            salePrice: 800,
            weight: 500,
            shippingType: 'inherit',
            weightClass: testWeightClass._id,
            taxRate: 5,
            taxIncluded: false,
        });
    });

    it('should calculate full pricing (subtotal, tax, shipping, total)', async () => {
        const params = {
            cartItems: [{
                product: testProduct,
                quantity: 2
            }],
            shippingAddress: {
                stateId: testState._id,
                countryId: testCountry._id
            }
        };

        const result = await calculatePricing(params);

        // Subtotal = 800 * 2 = 1600
        expect(result.subtotal).toBe(1600);

        // Shipping = 40 per unit × quantity 2
        expect(result.shipping.amount).toBe(80);

        // Items GST 5% of 1600 = 80; shipping GST 5% of 80 = 4
        expect(result.tax.amount).toBe(84);

        // Total = 1600 + 80 + 84 = 1764
        expect(result.total).toBe(1764);
        expect(result.shipping.method).toBe('flat');
    });

    it('should handle bulk discounts', async () => {
        // Add bulk discount to product
        testProduct.bulkDiscount = {
            enabled: true,
            tiers: [{
                minQuantity: 5,
                discountType: 'percentage',
                discountValue: 10 // 10% off
            }]
        };
        await testProduct.save();

        const params = {
            cartItems: [{
                product: testProduct,
                quantity: 10
            }],
            shippingAddress: {
                stateId: testState._id,
                countryId: testCountry._id
            }
        };

        const result = await calculatePricing(params);

        // Unit Price: 800. After 10% bulk: 720.
        // Subtotal: 720 * 10 = 7200
        expect(result.subtotal).toBe(7200);
        expect(result.discount.bulk).toBe(800); // 80 * 10
        expect(result.originalSubtotal).toBe(8000);
    });

    it('ignores client variantPriceSnapshot and uses Product.variantPricing', async () => {
        const variantProduct = await Product.create({
            name: 'Ring',
            sku: `PRC-VAR-${Date.now()}`,
            regularPrice: 500,
            salePrice: 500,
            weight: 200,
            shippingType: 'inherit',
            weightClass: testWeightClass._id,
            taxRate: 5,
            taxIncluded: false,
            variants: [{ type: 'Color', values: ['Gold'] }],
            variantPricing: {
                'color:gold': { price: 1999, salePrice: 1999 },
            },
        });

        const result = await calculatePricing({
            cartItems: [{
                product: variantProduct._id,
                quantity: 1,
                variantKey: 'color:gold',
                variantCombination: { Color: 'Gold' },
                variantPriceSnapshot: 1,
                price: 1,
            }],
            shippingAddress: {
                stateId: testState._id,
                countryId: testCountry._id,
            },
        });

        expect(result.subtotal).toBe(1999);
        expect(result.originalSubtotal).toBe(1999);
    });
});
