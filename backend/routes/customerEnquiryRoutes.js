const express = require('express');
const router = express.Router();
const optionalVerifyShopper = require('../middleware/optionalVerifyShopper');
const { createEnquiry } = require('../controllers/customerEnquiryController');

router.post('/', optionalVerifyShopper, createEnquiry);

module.exports = router;
