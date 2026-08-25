// routes/shipping.js
const express = require('express');
const router = express.Router();
const { verifyAdmin, loadAdminContext, requirePermission } = require('../utils/adminAuthChain');

const ShippingZone = require('../models/ShippingZone');
const WeightClass = require('../models/WeightClass');
const FlatShippingRule = require('../models/FlatShippingRule');
const FreeShippingRule = require('../models/FreeShippingRule');
const Product = require('../models/Product');
const { calculateShipping } = require('../services/shippingEngineService');

const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const catalogConfigManage = [verifyAdmin, loadAdminContext, requirePermission('catalog_config', 'manage')];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function assertUniqueWeightClassName(name, excludeId = null) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return { ok: false, message: 'Shipping Slab name is required.' };
  }
  const query = {
    name: { $regex: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') },
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const existing = await WeightClass.findOne(query).lean();
  if (existing) {
    return { ok: false, message: 'A Shipping Slab with this name already exists.' };
  }
  return { ok: true, name: trimmed };
}

async function countProductsReferencingWeightClass(weightClassId) {
  return Product.countDocuments({ weightClass: weightClassId });
}

router.get('/zones', ah(async (req, res) => {
  const zones = await ShippingZone.find({}).sort({ sortOrder: 1, name: 1 });
  res.json(zones);
}));

router.post('/zones', ...catalogConfigManage, ah(async (req, res) => {
  const z = await ShippingZone.create(req.body);
  res.status(201).json(z);
}));

router.put('/zones/:id', ...catalogConfigManage, ah(async (req, res) => {
  const z = await ShippingZone.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(z);
}));

router.delete('/zones/:id', ...catalogConfigManage, ah(async (req, res) => {
  await ShippingZone.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

router.get('/weight-classes', ah(async (req, res) => {
  const list = await WeightClass.find({}).sort({ sortOrder: 1, minWeightG: 1 });
  res.json(list);
}));

router.post('/weight-classes', ...catalogConfigManage, ah(async (req, res) => {
  const uniqueness = await assertUniqueWeightClassName(req.body?.name);
  if (!uniqueness.ok) {
    return res.status(400).json({ message: uniqueness.message });
  }
  const w = await WeightClass.create({ ...req.body, name: uniqueness.name });
  res.status(201).json(w);
}));

router.put('/weight-classes/:id', ...catalogConfigManage, ah(async (req, res) => {
  const existing = await WeightClass.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ message: 'Shipping Slab not found.' });
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
    const uniqueness = await assertUniqueWeightClassName(req.body.name, existing._id);
    if (!uniqueness.ok) {
      return res.status(400).json({ message: uniqueness.message });
    }
    req.body.name = uniqueness.name;
  }

  const nextActive = Object.prototype.hasOwnProperty.call(req.body, 'active')
    ? Boolean(req.body.active)
    : existing.active;
  if (existing.active && nextActive === false) {
    const refs = await countProductsReferencingWeightClass(existing._id);
    if (refs > 0) {
      return res.status(400).json({
        message: 'Cannot deactivate Shipping Slab while products reference it.',
      });
    }
  }

  const w = await WeightClass.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(w);
}));

router.delete('/weight-classes/:id', ...catalogConfigManage, ah(async (req, res) => {
  const refs = await countProductsReferencingWeightClass(req.params.id);
  if (refs > 0) {
    return res.status(400).json({
      message: 'Cannot delete Shipping Slab while products reference it.',
    });
  }
  await WeightClass.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

router.get('/flat-rules', ah(async (req, res) => {
  const rules = await FlatShippingRule.find({ active: true })
    .populate('zone', 'name code')
    .populate('weightClass', 'name minWeightG maxWeightG')
    .sort({ sortOrder: 1 });
  res.json(rules);
}));

router.post('/flat-rules', ...catalogConfigManage, ah(async (req, res) => {
  const rule = await FlatShippingRule.create(req.body);
  await rule.populate('zone weightClass');
  res.status(201).json(rule);
}));

router.put('/flat-rules/:id', ...catalogConfigManage, ah(async (req, res) => {
  const rule = await FlatShippingRule.findByIdAndUpdate(req.params.id, req.body, { new: true });
  await rule.populate('zone weightClass');
  res.json(rule);
}));

router.delete('/flat-rules/:id', ...catalogConfigManage, ah(async (req, res) => {
  await FlatShippingRule.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

function wantsIncludeInactive(query) {
  const v = query?.includeInactive;
  return v === true || v === 'true' || v === '1';
}

/**
 * GET /api/shipping/free-rules
 * Public default: active rules only (checkout/engine consumers).
 * Admin: ?includeInactive=true|1 — auth-gated same as manage routes — lists all rules.
 * Does not invent default thresholds.
 */
router.get('/free-rules', (req, res, next) => {
  if (!wantsIncludeInactive(req.query)) return next();
  let i = 0;
  const run = (err) => {
    if (err) return next(err);
    if (i >= catalogConfigManage.length) return next();
    const mw = catalogConfigManage[i++];
    return mw(req, res, run);
  };
  return run();
}, ah(async (req, res) => {
  const filter = wantsIncludeInactive(req.query) ? {} : { active: true };
  const rules = await FreeShippingRule.find(filter)
    .populate('zones', 'name code')
    .sort({ sortOrder: 1, minOrderAmountINR: 1 });
  res.json(rules);
}));

router.post('/free-rules', ...catalogConfigManage, ah(async (req, res) => {
  const rule = await FreeShippingRule.create(req.body);
  await rule.populate('zones');
  res.status(201).json(rule);
}));

router.put('/free-rules/:id', ...catalogConfigManage, ah(async (req, res) => {
  const rule = await FreeShippingRule.findByIdAndUpdate(req.params.id, req.body, { new: true });
  await rule.populate('zones');
  res.json(rule);
}));

router.delete('/free-rules/:id', ...catalogConfigManage, ah(async (req, res) => {
  await FreeShippingRule.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

router.post('/quote', ...catalogConfigManage, ah(async (req, res) => {
  const { zone, weightClass, weight, cartValue, coupon } = req.body;

  if (!weightClass) {
    return res.status(400).json({ message: 'Shipping Slab is required.' });
  }

  const cartItems = [{
    product: {
      weight: parseFloat(weight) || 0,
      weightClass,
      salePrice: parseFloat(cartValue) || 0,
      regularPrice: parseFloat(cartValue) || 0,
    },
    quantity: 1
  }];

  try {
    const result = await calculateShipping({
      cartItems,
      shippingAddress: null,
      couponCode: coupon,
      forceZoneId: zone
    });

    res.json({
      charge: result.shippingCharge,
      method: result.shippingMethod,
      zone: result.shippingZone ? result.shippingZone.name : 'Unknown',
      weight: parseFloat(weight) || 0,
      weightClass,
      breakdown: result
    });
  } catch (error) {
    console.error('❌ Quote Tester Error:', error);
    const status = error.name === 'ShippingEngineError' ? 400 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
}));

module.exports = router;
