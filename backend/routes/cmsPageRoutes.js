const express = require('express');
const router = express.Router();
const cmsPageController = require('../controllers/cmsPageController');

router.get('/public', cmsPageController.getPublishedPageBySlug);

module.exports = router;
