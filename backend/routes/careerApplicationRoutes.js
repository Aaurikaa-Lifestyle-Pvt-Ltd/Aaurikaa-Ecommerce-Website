const express = require('express');
const router = express.Router();
const optionalVerifyShopper = require('../middleware/optionalVerifyShopper');
const {
  parseCareerApplicationForm,
  rejectCareerApplicationHoneypot,
  uploadCareerResumeToR2,
  handleCareerResumeUploadError,
} = require('../middleware/careerResumeUpload');
const { submitApplication } = require('../controllers/careerApplicationController');

router.post(
  '/',
  optionalVerifyShopper,
  parseCareerApplicationForm,
  rejectCareerApplicationHoneypot,
  uploadCareerResumeToR2,
  handleCareerResumeUploadError,
  submitApplication
);

module.exports = router;
