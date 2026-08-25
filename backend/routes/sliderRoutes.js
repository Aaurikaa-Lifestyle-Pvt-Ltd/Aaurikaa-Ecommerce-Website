const express = require('express');
const router = express.Router();
const sliderController = require('../controllers/sliderController');
const { upload: uploadSlider, handleUploadError } = require('../middleware/uploadSlider');
const { withAdminAuth } = require('../utils/adminAuthChain');

const homepageManage = withAdminAuth('homepage', 'manage');

router.get('/', sliderController.getAllSliders);
router.post('/', ...homepageManage, uploadSlider, handleUploadError, sliderController.createSlider);
router.put('/:id', ...homepageManage, uploadSlider, handleUploadError, sliderController.updateSlider);
router.delete('/:id', ...homepageManage, sliderController.deleteSlider);

module.exports = router;
