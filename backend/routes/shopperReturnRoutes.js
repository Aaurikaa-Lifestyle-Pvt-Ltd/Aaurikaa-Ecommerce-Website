const express = require("express");
const router = express.Router({ mergeParams: true });
const verifyShopper = require("../middleware/verifyShopper");
const {
  getReturnEligibility,
  createReturnRequest,
  getReturnRequest,
  uploadReturnEvidence,
  submitReturnAppeal,
} = require("../controllers/shopperReturnController");
const {
  parseReturnEvidenceUpload,
  enforceEvidenceFileSizeLimits,
  uploadReturnEvidenceToR2,
  handleReturnEvidenceUploadError,
} = require("../middleware/returnEvidenceUpload");

/**
 * GET /api/shopper/orders/:id/return-eligibility
 * Read-only eligibility check for a specific order.
 */
router.get("/:id/return-eligibility", verifyShopper, getReturnEligibility);

/**
 * GET /api/shopper/orders/:id/return-request
 * Retrieve shopper's existing return request for an order.
 */
router.get("/:id/return-request", verifyShopper, getReturnRequest);

/**
 * POST /api/shopper/orders/:id/return-evidence
 * Upload Need Help evidence files before submitting the request.
 */
router.post(
  "/:id/return-evidence",
  verifyShopper,
  parseReturnEvidenceUpload,
  enforceEvidenceFileSizeLimits,
  uploadReturnEvidenceToR2,
  uploadReturnEvidence,
  handleReturnEvidenceUploadError
);

/**
 * POST /api/shopper/orders/:id/return-request
 * Submit a new Need Help / return request.
 */
router.post("/:id/return-request", verifyShopper, createReturnRequest);

/**
 * POST /api/shopper/orders/:id/return-appeal
 * One-time appeal after seller resolution.
 */
router.post("/:id/return-appeal", verifyShopper, submitReturnAppeal);

module.exports = router;
