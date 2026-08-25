const express = require('express');
const router = express.Router();
const staticPageController = require('../controllers/staticPageController');

router.get('/public', staticPageController.getPublishedByPageKey);

module.exports = router;
