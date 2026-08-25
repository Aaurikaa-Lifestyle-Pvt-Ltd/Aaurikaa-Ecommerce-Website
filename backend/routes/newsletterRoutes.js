const express = require('express');
const router = express.Router();
const {
    subscribeNewsletter,
    getAllSubscribers,
    getSubscriberById,
    exportSubscribers
} = require('../controllers/newsletterController');
const { withAdminAuth } = require('../utils/adminAuthChain');

router.post('/subscribe', subscribeNewsletter);

router.get('/', ...withAdminAuth('newsletter', 'view'), getAllSubscribers);
router.get('/export', ...withAdminAuth('newsletter', 'view'), exportSubscribers);
router.get('/:id', ...withAdminAuth('newsletter', 'view'), getSubscriberById);

module.exports = router;
