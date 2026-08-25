const mongoose = require('mongoose');
const ShippingZone = require('../models/ShippingZone');

const WeightClass = require('../models/WeightClass');
const FlatShippingRule = require('../models/FlatShippingRule');
const FreeShippingRule = require('../models/FreeShippingRule');
const State = require('../models/location/State');
const Country = require('../models/location/Country');
const Coupon = require('../models/coupon');
const Product = require('../models/Product');
const { calculateBulkDiscount } = require('../utils/bulkDiscountCalculator');
const { SHIPPING_METHOD_NOT_APPLICABLE } = require('../constants/shippingConstants');

/** Fail-closed shipping pricing errors (no ₹50/₹70 silent fallback). */
class ShippingEngineError extends Error {
    constructor(message, code = 'SHIPPING_ENGINE_ERROR') {
        super(message);
        this.name = 'ShippingEngineError';
        this.code = code;
    }
}

function buildNotApplicableShippingResult() {
    return {
        shippingCharge: 0,
        shippingMethod: SHIPPING_METHOD_NOT_APPLICABLE,
        shippingZone: null,
        weightClass: null,
        weightClasses: [],
        ruleApplied: null,
        applicable: false,
        engineInput: { shippableWeightG: 0, shippableSubtotal: 0 },
    };
}

function extractProductId(item) {
    let productId = item?.product;
    if (productId && typeof productId === 'object') {
        productId = productId._id || productId.id;
    }
    if (!productId) return null;
    const asString = String(productId);
    return mongoose.Types.ObjectId.isValid(asString) ? asString : null;
}

function extractWeightClassId(product) {
    const raw = product?.weightClass;
    if (!raw) return null;
    if (typeof raw === 'object') {
        const id = raw._id || raw.id;
        return id ? String(id) : null;
    }
    return String(raw);
}

/**
 * Calculate final shipping charge for a set of items and address.
 * Charge = sum over cart lines of (FlatShippingRule rate × quantity) for the product WeightClass in the destination zone.
 * Product weight is logistics/audit only (not used for charge matching).
 * Every purchasable unit contributes its slab rate (quantity multiplies).
 *
 * @param {Object} params
 * @param {Array} params.cartItems - Array of { product: id/obj, quantity: number, variantPriceSnapshot: number }
 * @param {Object} params.shippingAddress - { stateId, countryId, pincode }
 * @param {string} params.couponCode - Optional coupon code for free shipping
 * @param {string} params.forceZoneId - Optional: directly provide a Zone ID (bypasses address resolution)
 * @returns {Object} { shippingCharge, shippingMethod, shippingZone, weightClass, weightClasses, ruleApplied, engineInput }
 */
async function calculateShipping({ cartItems, shippingAddress, couponCode, forceZoneId = null }) {
    if (!cartItems || cartItems.length === 0) {
        return buildNotApplicableShippingResult();
    }

    const result = {
        shippingCharge: 0,
        shippingMethod: 'none',
        shippingZone: null,
        weightClass: null,
        weightClasses: [],
        ruleApplied: null,
        applicable: true,
        engineInput: { shippableWeightG: 0, shippableSubtotal: 0 },
    };

    // 1. Batch-load products (no per-line findById)
    const productIds = [];
    const seenIds = new Set();
    for (const item of cartItems) {
        const id = extractProductId(item);
        if (id && !seenIds.has(id)) {
            seenIds.add(id);
            productIds.push(id);
        }
    }

    const productsFromDb = productIds.length > 0
        ? await Product.find({ _id: { $in: productIds } })
            .select('weight weightClass salePrice regularPrice bulkDiscount')
            .lean()
        : [];
    const productMap = new Map(productsFromDb.map((p) => [String(p._id), p]));

    let totalWeightG = 0;
    let totalSalePrice = 0;
    const distinctClassIds = [];
    const distinctClassIdSet = new Set();
    const qtyByClassId = new Map();

    for (const item of cartItems) {
        const id = extractProductId(item);
        let product = id ? productMap.get(id) : null;

        // Quote / synthetic payloads: use provided object when DB row is absent
        if (!product && item.product && typeof item.product === 'object') {
            product = item.product;
        }

        if (!product) {
            throw new ShippingEngineError(
                'One or more products could not be loaded for shipping calculation.',
                'PRODUCT_NOT_FOUND'
            );
        }

        const qty = item.quantity || 1;
        const unitWeight = parseFloat(product.weight) || 0;
        totalWeightG += unitWeight * qty;

        let unitPrice = item.variantPriceSnapshot || product.salePrice || product.regularPrice || 0;
        if (product.bulkDiscount?.enabled && product.bulkDiscount?.tiers?.length > 0) {
            const bulkResult = calculateBulkDiscount(product, qty, unitPrice);
            if (bulkResult.success) {
                unitPrice = bulkResult.discountedPrice;
            }
        }
        totalSalePrice += unitPrice * qty;

        const classId = extractWeightClassId(product);
        if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
            throw new ShippingEngineError(
                'One or more products are missing a Shipping Slab.',
                'MISSING_WEIGHT_CLASS'
            );
        }
        if (!distinctClassIdSet.has(classId)) {
            distinctClassIdSet.add(classId);
            distinctClassIds.push(classId);
        }
        qtyByClassId.set(classId, (qtyByClassId.get(classId) || 0) + qty);
    }

    totalWeightG = Math.round(totalWeightG * 100) / 100;
    result.engineInput = {
        shippableWeightG: totalWeightG,
        shippableSubtotal: Math.round(totalSalePrice * 100) / 100,
    };

    // Quote preview before checkout destination is known: allow coupon/subtotal
    // calculation with shipping deferred (not complimentary — UI must not label FREE).
    if (!forceZoneId && isShippingAddressInsufficient(shippingAddress)) {
        return {
            ...result,
            shippingCharge: 0,
            shippingMethod: "pending",
            applicable: true,
            pendingAddress: true,
        };
    }

    // 2. Validate distinct WeightClasses (active) — one query
    const weightClasses = await WeightClass.find({ _id: { $in: distinctClassIds } }).lean();
    const weightClassMap = new Map(weightClasses.map((wc) => [String(wc._id), wc]));

    for (const classId of distinctClassIds) {
        const wc = weightClassMap.get(classId);
        if (!wc) {
            throw new ShippingEngineError(
                'Shipping Slab is invalid or no longer exists.',
                'INVALID_WEIGHT_CLASS'
            );
        }
        if (!wc.active) {
            throw new ShippingEngineError(
                'Shipping Slab is inactive.',
                'INACTIVE_WEIGHT_CLASS'
            );
        }
    }

    // 3. Resolve zone once
    let zone = null;
    if (forceZoneId) {
        if (mongoose.Types.ObjectId.isValid(String(forceZoneId))) {
            zone = await ShippingZone.findOne({ _id: forceZoneId, active: true });
        }
    } else {
        zone = await resolveZone(shippingAddress);
    }

    result.shippingZone = zone ? { _id: zone._id, name: zone.name, code: zone.code } : null;

    if (!zone) {
        throw new ShippingEngineError(
            'We could not determine a shipping zone for this address.',
            'ZONE_UNRESOLVED'
        );
    }

    // 4. Batch-load FlatShippingRules for (zone, distinct weightClasses)
    const flatRules = await FlatShippingRule.find({
        active: true,
        zone: zone._id,
        weightClass: { $in: distinctClassIds },
    }).lean();

    const ruleByClassId = new Map(
        flatRules.map((rule) => [String(rule.weightClass), rule])
    );

    const classRateEntries = [];
    for (const classId of distinctClassIds) {
        const rule = ruleByClassId.get(classId);
        if (!rule) {
            throw new ShippingEngineError(
                'Shipping is not configured for this Shipping Slab in your delivery area.',
                'FLAT_RULE_MISSING'
            );
        }
        const wc = weightClassMap.get(classId);
        classRateEntries.push({
            weightClassId: wc._id,
            name: wc.name,
            range: `${wc.minWeightG}-${wc.maxWeightG}g`,
            rate: rule.rateINR,
            ruleId: rule._id,
        });
    }

    // 5. Base charge = sum of (rate × quantity) per WeightClass units in the cart
    const baseCharge = classRateEntries.reduce((sum, entry) => {
        const qty = qtyByClassId.get(String(entry.weightClassId)) || 0;
        return sum + (Number(entry.rate) || 0) * qty;
    }, 0);

    result.weightClasses = classRateEntries.map(({ weightClassId, name, range, rate }) => ({
        _id: weightClassId,
        name,
        range,
        rate,
    }));
    result.weightClass = classRateEntries.length === 1
        ? {
            _id: classRateEntries[0].weightClassId,
            name: classRateEntries[0].name,
            range: classRateEntries[0].range,
        }
        : null;

    // 6. Overlays after base sum (existing priority: coupon → free rule → flat sum)
    if (couponCode) {
        const coupon = await Coupon.findOne({
            code: couponCode.toUpperCase(),
            isActive: true,
            freeShipping: true,
        });
        if (coupon) {
            result.shippingCharge = 0;
            result.shippingMethod = 'free_coupon';
            result.ruleApplied = { type: 'coupon', code: coupon.code };
            return result;
        }
    }

    const freeRules = await FreeShippingRule.find({ active: true }).sort({
        sortOrder: 1,
        minOrderAmountINR: 1,
    });
    for (const rule of freeRules) {
        const zoneOk =
            rule.allZones ||
            (rule.zones || []).some((z) => z.toString() === zone._id.toString());
        if (zoneOk && totalSalePrice >= rule.minOrderAmountINR) {
            result.shippingCharge = 0;
            result.shippingMethod = 'free_rule_conditional';
            result.ruleApplied = { type: 'free_shipping_rule', id: rule._id, name: rule.name };
            return result;
        }
    }

    result.shippingCharge = baseCharge;
    result.shippingMethod = 'flat';
    result.ruleApplied = {
        type: classRateEntries.length === 1 ? 'flat_rule' : 'flat_rule_sum',
        rate: baseCharge,
        classes: classRateEntries.map(({ weightClassId, name, rate, ruleId }) => ({
            weightClassId,
            name,
            rate,
            ruleId,
        })),
    };
    if (classRateEntries.length === 1) {
        result.ruleApplied.id = classRateEntries[0].ruleId;
    }

    return result;
}

/**
 * Resolve Zone from Address
 * State (ID then Name) -> Pincode prefix -> Country
 */
function isShippingAddressInsufficient(address) {
  if (!address || typeof address !== "object") return true;
  const hasState = Boolean(address.stateId || address.state);
  const hasPin = Boolean(address.pincode || address.zip);
  const hasCountry = Boolean(address.countryId || address.country);
  return !hasState && !hasPin && !hasCountry;
}

async function resolveZone(address) {
    if (!address) return null;

    const { stateId, countryId, pincode } = address;

    // 1. Precise Match: State
    if (stateId) {
        const isValidId = mongoose.Types.ObjectId.isValid(stateId);

        if (isValidId) {
            let zone = await ShippingZone.findOne({ active: true, stateIds: stateId });
            if (zone) return zone;

            try {
                const stateDoc = await State.findById(stateId);
                if (stateDoc) {
                    zone = await ShippingZone.findOne({ active: true, states: { $in: [stateDoc.name] } });
                    if (zone) return zone;
                }
            } catch (err) {
                console.warn('⚠️ resolveZone: State findById failed', err.message);
            }
        } else {
            const zone = await ShippingZone.findOne({ active: true, states: { $in: [stateId] } });
            if (zone) return zone;
        }
    }

    // 2. Pin Prefix Match
    if (pincode) {
        const prefix = pincode.toString().substring(0, 3);
        const zone = await ShippingZone.findOne({ active: true, pinPrefixes: { $in: [prefix] } });
        if (zone) return zone;
    }

    // 3. Broad Match: Country
    if (countryId) {
        const countryDoc = await Country.findById(countryId);
        if (countryDoc) {
            const zone = await ShippingZone.findOne({ active: true, country: countryDoc.code });
            if (zone) return zone;
        }
    }

    return null;
}

/**
 * List active Shipping Slabs with zone FlatShippingRule rates (no ₹50 default).
 * Missing zone or missing rule → available: false, cost: null.
 */
async function getAvailableShippingMethods(shippingAddress) {
    try {
        const shippingZone = shippingAddress
            ? await resolveZone(shippingAddress)
            : null;

        const weightClasses = await WeightClass.find({ active: true })
            .sort({ sortOrder: 1, minWeightG: 1 })
            .lean();

        if (!shippingZone) {
            return weightClasses.map((wc) => ({
                id: wc._id,
                name: wc.name,
                minWeightG: wc.minWeightG,
                maxWeightG: wc.maxWeightG,
                cost: null,
                available: false,
                label: null,
            }));
        }

        const flatRules = await FlatShippingRule.find({
            active: true,
            zone: shippingZone._id,
        })
            .populate('weightClass')
            .lean();

        const ruleByClassId = new Map(
            flatRules
                .filter((r) => r.weightClass)
                .map((r) => [String(r.weightClass._id || r.weightClass), r])
        );

        return weightClasses.map((wc) => {
            const rule = ruleByClassId.get(String(wc._id));
            return {
                id: wc._id,
                name: wc.name,
                minWeightG: wc.minWeightG,
                maxWeightG: wc.maxWeightG,
                cost: rule ? rule.rateINR : null,
                available: !!rule,
                label: rule
                    ? (rule.label || `Flat Shipping (${shippingZone.code}, ${wc.name})`)
                    : null,
            };
        });
    } catch (error) {
        console.error('❌ Error getting available shipping methods:', error);
        return [];
    }
}

module.exports = {
    calculateShipping,
    resolveZone,
    buildNotApplicableShippingResult,
    getAvailableShippingMethods,
    ShippingEngineError,
};
