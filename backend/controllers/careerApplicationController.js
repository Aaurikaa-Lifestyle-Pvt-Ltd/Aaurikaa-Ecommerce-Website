const {
  createCareerApplication,
  toSubmitResponseDTO,
  buildFakeHoneypotResponse,
  hashClientIp,
} = require('../services/careerApplicationService');
const {
  sendApplicantSubmissionAcknowledgement,
  sendAdminNewApplicationAlert,
} = require('../services/careerNotificationService');
const {
  sendSuccessResponse,
  sendErrorResponse,
  HTTP_STATUS,
  ERROR_CODES,
} = require('../utils/errorHandler');

function parseSubmitPayload(req) {
  const body = req.body || {};

  return {
    careerId: body.careerId,
    applicant: {
      name: body.name,
      email: body.email,
      phone: body.phone,
    },
    coverLetter: body.coverLetter,
    website: body.website,
    applicationNumber: req._careerApplicationNumber,
    resume: req.file
      ? {
          storageKey: req.file.r2Key,
          originalFilename: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          uploadedAt: new Date(),
        }
      : null,
  };
}

exports.submitApplication = async (req, res) => {
  try {
    const shopperId = req.user ? (req.user._id || req.user.id) : null;
    const payload = parseSubmitPayload(req);

    const result = await createCareerApplication(payload, {
      shopperId,
      ipHash: hashClientIp(req),
      userAgent: req.get('User-Agent')?.slice(0, 500) || null,
    });

    if (result.honeypot) {
      return sendSuccessResponse(
        res,
        HTTP_STATUS.CREATED,
        'Your application has been submitted successfully.',
        buildFakeHoneypotResponse()
      );
    }

    if (result.invalid) {
      const errorCode = result.statusCode === 404
        ? ERROR_CODES.RESOURCE_NOT_FOUND
        : result.statusCode === 409
          ? ERROR_CODES.RESOURCE_ALREADY_EXISTS
          : ERROR_CODES.VALIDATION_FAILED;

      return sendErrorResponse(
        res,
        result.statusCode || HTTP_STATUS.BAD_REQUEST,
        result.message,
        errorCode
      );
    }

    const { application } = result;

    try {
      await sendApplicantSubmissionAcknowledgement(application);
      await sendAdminNewApplicationAlert(application);
    } catch (emailError) {
      console.error('Error sending career application notification emails:', emailError);
    }

    return sendSuccessResponse(
      res,
      HTTP_STATUS.CREATED,
      'Your application has been submitted successfully.',
      toSubmitResponseDTO(application)
    );
  } catch (err) {
    console.error('Submit career application error:', err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to submit application. Please try again later.',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};
