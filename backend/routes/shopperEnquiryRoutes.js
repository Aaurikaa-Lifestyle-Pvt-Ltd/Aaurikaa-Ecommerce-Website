const express = require('express');
const router = express.Router();
const verifyShopper = require('../middleware/verifyShopper');
const {
  listShopperEnquiries,
  getShopperEnquiryById,
} = require('../controllers/shopperEnquiryController');

router.use(verifyShopper);

router.get('/', listShopperEnquiries);
router.get('/:id', getShopperEnquiryById);

module.exports = router;
