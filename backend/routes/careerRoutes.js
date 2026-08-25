const express = require('express');
const router = express.Router();
const { listCareers, getCareerBySlug } = require('../controllers/careerController');

router.get('/', listCareers);
router.get('/slug/:slug', getCareerBySlug);

module.exports = router;
