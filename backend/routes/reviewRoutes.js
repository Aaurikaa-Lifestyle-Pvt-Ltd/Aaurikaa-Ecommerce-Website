const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const verifyShopper = require('../middleware/verifyShopper');
const verifySeller = require('../middleware/verifySeller');
const { withAdminAuth } = require('../utils/adminAuthChain');

const reviewsView = withAdminAuth('reviews', 'view');
const reviewsManage = withAdminAuth('reviews', 'manage');

router.get('/product/:productId', reviewController.getProductReviews);
router.get('/seller/:sellerId', reviewController.getSellerReviews);

router.post('/', verifyShopper, reviewController.createCustomerReview);
router.get('/me', verifyShopper, reviewController.getMyReviews);
router.put('/:reviewId', verifyShopper, reviewController.updateReview);
router.delete('/:reviewId', verifyShopper, reviewController.deleteReview);

router.post('/seller/:productId', verifySeller, reviewController.createSellerReview);
router.put('/seller/:productId', verifySeller, reviewController.updateSellerReview);

router.get('/admin', ...reviewsView, reviewController.listReviewsForAdmin);
router.patch('/admin/:id/approve', ...reviewsManage, reviewController.adminApproveReview);
router.patch('/admin/:id/reject', ...reviewsManage, reviewController.adminRejectReview);
router.post('/admin/:productId', ...reviewsManage, reviewController.createAdminReview);
router.put('/admin/:productId', ...reviewsManage, reviewController.updateAdminReview);
router.delete('/admin/:reviewId', ...reviewsManage, reviewController.deleteAnyReview);

module.exports = router;
