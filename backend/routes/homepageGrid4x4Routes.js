const express = require('express');
const router = express.Router();
const homepageGrid4x4Controller = require('../controllers/homepageGrid4x4Controller');
const verifyAdmin = require('../middleware/verifyAdmin');
const { r2Uploads, handleUploadError } = require('../middleware/secureUpload');

router.get('/', homepageGrid4x4Controller.getGrid4x4);

module.exports = router;
