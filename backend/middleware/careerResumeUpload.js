const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { validateFileContent, handleUploadError } = require('./secureUpload');
const { uploadFileToR2 } = require('../services/r2UploadService');
const { generateApplicationNumber, buildFakeHoneypotResponse } = require('../services/careerApplicationService');
const { sendSuccessResponse, HTTP_STATUS } = require('../utils/errorHandler');

const RESUME_MAX_BYTES = 5 * 1024 * 1024;

const RESUME_ALLOWED = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

const CLIENT_UPLOAD_VALIDATION_PATTERNS = [
  'Invalid file type',
  'File extension does not match',
  'File extension mismatch',
  'File content does not match',
  'Potentially dangerous file type',
];

const resumeFileFilter = (req, file, cb) => {
  const allowed = RESUME_ALLOWED[file.mimetype];
  if (!allowed) {
    return cb(new Error('Invalid file type. Resume must be a PDF, DOC, or DOCX file.'));
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (ext && !allowed.includes(ext)) {
    return cb(new Error('File extension does not match resume file type.'));
  }

  cb(null, true);
};

function buildResumeStorageKey(applicationNumber, originalname) {
  const random = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalname).toLowerCase() || '.pdf';
  const base = path
    .basename(originalname, ext)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80) || 'resume';

  return `careers/resumes/${applicationNumber}_${random}_${base}${ext}`;
}

function isHoneypotTriggered(body) {
  return Boolean(body?.website && String(body.website).trim());
}

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  fileFilter: resumeFileFilter,
  limits: { fileSize: RESUME_MAX_BYTES, files: 1 },
}).single('resume');

const parseCareerApplicationForm = (req, res, next) => {
  req._careerApplicationNumber = generateApplicationNumber();

  uploadMiddleware(req, res, (err) => {
    if (err) {
      return next(err);
    }
    next();
  });
};

const rejectCareerApplicationHoneypot = (req, res, next) => {
  if (!isHoneypotTriggered(req.body)) {
    return next();
  }

  return sendSuccessResponse(
    res,
    HTTP_STATUS.CREATED,
    'Your application has been submitted successfully.',
    buildFakeHoneypotResponse()
  );
};

const uploadCareerResumeToR2 = (req, res, next) => {
  if (!req.file) {
    return next();
  }

  (async () => {
    try {
      if (!validateFileContent(req.file.buffer, req.file.mimetype)) {
        return next(new Error('File content does not match the declared resume file type.'));
      }

      const key = buildResumeStorageKey(req._careerApplicationNumber, req.file.originalname);
      const result = await uploadFileToR2(req.file.buffer, key, req.file.mimetype);

      if (!result.success) {
        throw new Error(`Resume upload failed: ${result.error}`);
      }

      req.file.r2Key = result.key;
      next();
    } catch (error) {
      next(error);
    }
  })();
};

const handleCareerResumeUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return handleUploadError(err, req, res, next);
  }

  if (CLIENT_UPLOAD_VALIDATION_PATTERNS.some((pattern) => err.message.includes(pattern))) {
    return res.status(400).json({
      success: false,
      message: err.message,
      code: 'INVALID_FILE_TYPE',
      timestamp: new Date().toISOString(),
    });
  }

  if (err.message?.includes('Resume upload failed')) {
    return res.status(500).json({
      success: false,
      message: 'Failed to upload resume. Please try again later.',
      code: 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }

  return handleUploadError(err, req, res, next);
};

module.exports = {
  parseCareerApplicationForm,
  rejectCareerApplicationHoneypot,
  uploadCareerResumeToR2,
  handleCareerResumeUploadError,
};
