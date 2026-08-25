const mongoose = require('mongoose');
const {
    calculateShipping,
    resolveZone,
    ShippingEngineError,
} = require('../../services/shippingEngineService');
const ShippingZone = require('../../models/ShippingZone');
const WeightClass = require('../../models/WeightClass');
const FlatShippingRule = require('../../models/FlatShippingRule');
const FreeShippingRule = require('../../models/FreeShippingRule');
const State = require('../../models/location/State');
const Country = require('../../models/location/Country');
const Product = require('../../models/Product');
const Coupon = require('../../models/coupon');

  describe('Shipping Engine Service — slab-select + rate × quantity', () => {
    let testState, testCountry, testZone, lightClass, heavyClass;

    beforeAll(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test_db');
        }
    });

    afterAll(async () => {
        await mongoose.connection.close();
    });

    beforeEach(async () => {
        await ShippingZone.deleteMany({});
        await WeightClass.deleteMany({});
        await FlatShippingRule.deleteMany({});
        await FreeShippingRule.deleteMany({});
        await State.deleteMany({});
        await Country.deleteMany({});
        await Product.deleteMany({});
        await Coupon.deleteMany({});

        testCountry = await Country.create({ name: 'India', code: 'IN' });
        testState = await State.create({ name: 'West Bengal', country: testCountry._id });

        testZone = await ShippingZone.create({
            name: 'East India',
            code: 'EAST',
            country: 'IN',
            states: ['West Bengal'],
            active: true,
        });

        lightClass = await WeightClass.create({
            name: 'Light',
            minWeightG: 0,
            maxWeightG: 1000,
            active: true,
            sortOrder: 1,
        });

        heavyClass = await WeightClass.create({
            name: 'Heavy',
            minWeightG: 1001,
            maxWeightG: 5000,
            active: true,
            sortOrder: 2,
        });
    });

    const address = () => ({
        stateId: testState._id,
        countryId: testCountry._id,
        pincode: '700001',
    });

    it('calculates flat shipping from product weightClass (ignores weight for matching)', async () => {
        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: lightClass._id,
            rateINR: 60,
            active: true,
        });

        const product = await Product.create({
            name: 'Phone',
            sku: 'PH-1',
            regularPrice: 10000,
            weight: 500,
            weightClass: lightClass._id,
        });

        const result = await calculateShipping({
            cartItems: [{ product: product._id, quantity: 1 }],
            shippingAddress: address(),
        });

        expect(result.shippingCharge).toBe(60);
        expect(result.shippingMethod).toBe('flat');
        expect(result.shippingZone.name).toBe('East India');
        expect(result.weightClass.name).toBe('Light');
        expect(result.engineInput.shippableWeightG).toBe(500);
    });

    it('does not change charge when product weight changes (same slab)', async () => {
        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: lightClass._id,
            rateINR: 60,
            active: true,
        });

        const product = await Product.create({
            name: 'Phone',
            sku: 'PH-WT',
            regularPrice: 10000,
            weight: 100,
            weightClass: lightClass._id,
        });

        const light = await calculateShipping({
            cartItems: [{ product: product._id, quantity: 1 }],
            shippingAddress: address(),
        });

        product.weight = 900;
        await product.save();

        const heavyWeight = await calculateShipping({
            cartItems: [{ product: product._id, quantity: 1 }],
            shippingAddress: address(),
        });

        expect(light.shippingCharge).toBe(60);
        expect(heavyWeight.shippingCharge).toBe(60);
        expect(heavyWeight.engineInput.shippableWeightG).toBe(900);
    });

    it('multiplies slab rate by quantity and does not collapse same WeightClass lines', async () => {
        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: lightClass._id,
            rateINR: 60,
            active: true,
        });

        const p1 = await Product.create({
            name: 'A',
            sku: 'A-1',
            regularPrice: 100,
            weight: 200,
            weightClass: lightClass._id,
        });
        const p2 = await Product.create({
            name: 'B',
            sku: 'B-1',
            regularPrice: 100,
            weight: 300,
            weightClass: lightClass._id,
        });

        const twoLines = await calculateShipping({
            cartItems: [
                { product: p1._id, quantity: 1 },
                { product: p2._id, quantity: 1 },
            ],
            shippingAddress: address(),
        });

        const qtyFive = await calculateShipping({
            cartItems: [{ product: p1._id, quantity: 5 }],
            shippingAddress: address(),
        });

        expect(twoLines.shippingCharge).toBe(120); // 1×60 + 1×60
        expect(qtyFive.shippingCharge).toBe(300); // 5×60
    });

    it('sums rate × quantity for distinct WeightClasses in a mixed cart', async () => {
        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: lightClass._id,
            rateINR: 60,
            active: true,
        });
        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: heavyClass._id,
            rateINR: 120,
            active: true,
        });

        const p1 = await Product.create({
            name: 'Light Item',
            sku: 'L-1',
            regularPrice: 100,
            weight: 200,
            weightClass: lightClass._id,
        });
        const p2 = await Product.create({
            name: 'Heavy Item',
            sku: 'H-1',
            regularPrice: 100,
            weight: 2000,
            weightClass: heavyClass._id,
        });

        const result = await calculateShipping({
            cartItems: [
                { product: p1._id, quantity: 3 },
                { product: p2._id, quantity: 2 },
            ],
            shippingAddress: address(),
        });

        expect(result.shippingCharge).toBe(420); // (3×60) + (2×120)
        expect(result.shippingMethod).toBe('flat');
        expect(result.ruleApplied.type).toBe('flat_rule_sum');
        expect(result.weightClasses).toHaveLength(2);
    });

    it('treats ₹0 FlatShippingRule as valid charge (No Shipping Charge slab)', async () => {
        const zeroClass = await WeightClass.create({
            name: 'No Shipping Charge (₹0/-)',
            minWeightG: 0,
            maxWeightG: 99999,
            active: true,
            sortOrder: 0,
        });
        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: zeroClass._id,
            rateINR: 0,
            active: true,
        });
        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: lightClass._id,
            rateINR: 60,
            active: true,
        });

        const freeShipProduct = await Product.create({
            name: 'Promo',
            sku: 'Z-1',
            regularPrice: 50,
            weight: 100,
            weightClass: zeroClass._id,
        });
        const paid = await Product.create({
            name: 'Paid Ship',
            sku: 'Z-2',
            regularPrice: 50,
            weight: 100,
            weightClass: lightClass._id,
        });

        const zeroOnly = await calculateShipping({
            cartItems: [{ product: freeShipProduct._id, quantity: 2 }],
            shippingAddress: address(),
        });
        expect(zeroOnly.shippingCharge).toBe(0);
        expect(zeroOnly.shippingMethod).toBe('flat');

        const zeroQtyTwenty = await calculateShipping({
            cartItems: [{ product: freeShipProduct._id, quantity: 20 }],
            shippingAddress: address(),
        });
        expect(zeroQtyTwenty.shippingCharge).toBe(0);

        const mixed = await calculateShipping({
            cartItems: [
                { product: freeShipProduct._id, quantity: 1 },
                { product: paid._id, quantity: 1 },
            ],
            shippingAddress: address(),
        });
        expect(mixed.shippingCharge).toBe(60);
    });

    it('ignores seller shippingType flat/free shortcuts', async () => {
        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: lightClass._id,
            rateINR: 60,
            active: true,
        });

        const flatSeller = await Product.create({
            name: 'Seller Flat',
            sku: 'SF-1',
            regularPrice: 200,
            weight: 100,
            weightClass: lightClass._id,
            shippingType: 'flat',
            shippingCharge: 150,
        });

        const freeSeller = await Product.create({
            name: 'Seller Free',
            sku: 'SFR-1',
            regularPrice: 200,
            weight: 100,
            weightClass: lightClass._id,
            shippingType: 'free',
        });

        const flatResult = await calculateShipping({
            cartItems: [{ product: flatSeller._id, quantity: 2 }],
            shippingAddress: address(),
        });
        const freeResult = await calculateShipping({
            cartItems: [{ product: freeSeller._id, quantity: 1 }],
            shippingAddress: address(),
        });

        expect(flatResult.shippingCharge).toBe(120); // 2×60 slab rate; seller shippingCharge ignored
        expect(flatResult.shippingMethod).toBe('flat');
        expect(freeResult.shippingCharge).toBe(60);
        expect(freeResult.shippingMethod).toBe('flat');
    });

    it('applies free shipping from rule after base calc', async () => {
        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: lightClass._id,
            rateINR: 60,
            active: true,
        });
        await FreeShippingRule.create({
            name: 'Mega Sale Free Shipping',
            minOrderAmountINR: 5000,
            allZones: true,
            active: true,
        });

        const product = await Product.create({
            name: 'Expensive Item',
            sku: 'EXP-1',
            regularPrice: 6000,
            weight: 500,
            weightClass: lightClass._id,
        });

        const result = await calculateShipping({
            cartItems: [{ product: product._id, quantity: 1 }],
            shippingAddress: address(),
        });

        expect(result.shippingCharge).toBe(0);
        expect(result.shippingMethod).toBe('free_rule_conditional');
    });

    it('applies free shipping from coupon (Priority 1)', async () => {
        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: lightClass._id,
            rateINR: 60,
            active: true,
        });

        await Coupon.create({
            code: 'FREESHIP',
            discountType: 'percentage',
            discountValue: 0,
            freeShipping: true,
            isActive: true,
            validFrom: new Date(Date.now() - 86400000),
            validTo: new Date(Date.now() + 86400000),
        });

        const product = await Product.create({
            name: 'Phone',
            sku: 'PH-FS',
            regularPrice: 10000,
            weight: 500,
            weightClass: lightClass._id,
        });

        const result = await calculateShipping({
            cartItems: [{ product: product._id, quantity: 1 }],
            shippingAddress: address(),
            couponCode: 'FREESHIP',
        });

        expect(result.shippingCharge).toBe(0);
        expect(result.shippingMethod).toBe('free_coupon');
    });

    it('fails closed when zone cannot be resolved (no ₹50)', async () => {
        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: lightClass._id,
            rateINR: 60,
            active: true,
        });

        const product = await Product.create({
            name: 'Item',
            sku: 'ITEM-1',
            regularPrice: 100,
            weight: 100,
            weightClass: lightClass._id,
        });

        await expect(
            calculateShipping({
                cartItems: [{ product: product._id, quantity: 1 }],
                shippingAddress: { pincode: '999999' },
            })
        ).rejects.toMatchObject({
            name: 'ShippingEngineError',
            message: 'We could not determine a shipping zone for this address.',
        });
    });

    it('fails closed when product is missing weightClass', async () => {
        const product = await Product.create({
            name: 'No Slab',
            sku: 'NS-1',
            regularPrice: 100,
            weight: 100,
        });

        await expect(
            calculateShipping({
                cartItems: [{ product: product._id, quantity: 1 }],
                shippingAddress: address(),
            })
        ).rejects.toMatchObject({
            name: 'ShippingEngineError',
            message: 'One or more products are missing a Shipping Slab.',
        });
    });

    it('fails closed when FlatShippingRule is missing for zone+class', async () => {
        const product = await Product.create({
            name: 'No Rule',
            sku: 'NR-1',
            regularPrice: 100,
            weight: 100,
            weightClass: lightClass._id,
        });

        await expect(
            calculateShipping({
                cartItems: [{ product: product._id, quantity: 1 }],
                shippingAddress: address(),
            })
        ).rejects.toMatchObject({
            name: 'ShippingEngineError',
            message: 'Shipping is not configured for this Shipping Slab in your delivery area.',
        });
    });

    it('fails closed when WeightClass is inactive', async () => {
        const inactive = await WeightClass.create({
            name: 'Inactive Slab',
            minWeightG: 0,
            maxWeightG: 100,
            active: false,
            sortOrder: 9,
        });
        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: inactive._id,
            rateINR: 40,
            active: true,
        });

        const product = await Product.create({
            name: 'Inactive Ref',
            sku: 'IR-1',
            regularPrice: 100,
            weight: 50,
            weightClass: inactive._id,
        });

        await expect(
            calculateShipping({
                cartItems: [{ product: product._id, quantity: 1 }],
                shippingAddress: address(),
            })
        ).rejects.toMatchObject({
            name: 'ShippingEngineError',
            message: 'Shipping Slab is inactive.',
        });
    });

    it('supports forceZoneId + synthetic product for quote tester', async () => {
        await FlatShippingRule.create({
            zone: testZone._id,
            weightClass: lightClass._id,
            rateINR: 60,
            active: true,
        });

        const result = await calculateShipping({
            cartItems: [{
                product: {
                    weight: 500,
                    weightClass: lightClass._id,
                    salePrice: 1000,
                    regularPrice: 1000,
                },
                quantity: 1,
            }],
            shippingAddress: null,
            forceZoneId: testZone._id,
        });

        expect(result.shippingCharge).toBe(60);
        expect(result.shippingZone.name).toBe('East India');
    });

    it('defers shipping when destination address is not provided yet', async () => {
        const result = await calculateShipping({
            cartItems: [{
                product: {
                    weight: 500,
                    weightClass: lightClass._id,
                    salePrice: 1000,
                    regularPrice: 1000,
                },
                quantity: 1,
            }],
            shippingAddress: null,
        });

        expect(result.shippingMethod).toBe('pending');
        expect(result.pendingAddress).toBe(true);
        expect(result.shippingCharge).toBe(0);
        expect(result.applicable).toBe(true);
    });

    it('resolveZone matches by state name fallback', async () => {
        const zone = await resolveZone({ stateId: testState._id });
        expect(zone).not.toBeNull();
        expect(zone.name).toBe('East India');
    });
});
