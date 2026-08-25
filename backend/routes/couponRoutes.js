const express = require('express');
const router = express.Router();
const couponCtrl = require('../controllers/couponController');
const { withAdminAuth } = require('../utils/adminAuthChain');

router.get('/', ...withAdminAuth('promotions', 'view'), couponCtrl.getCoupons);
router.post('/', ...withAdminAuth('promotions', 'manage'), couponCtrl.addCoupon);
router.put('/:id', ...withAdminAuth('promotions', 'manage'), couponCtrl.updateCoupon);
router.delete('/:id', ...withAdminAuth('promotions', 'manage'), couponCtrl.deleteCoupon);

module.exports = router;
