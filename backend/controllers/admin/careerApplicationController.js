const {
  listApplicationsForAdmin,
  getApplicationById,
  updateApplication,
  getApplicationStats,
  getApplicationResumeForDownload,
} = require('../../services/careerApplicationService');
const { sendApplicantStatusUpdate } = require('../../services/careerNotificationService');
const { getFileStreamFromR2 } = require('../../services/r2UploadService');
const {
  sendSuccessResponse,
  sendErrorResponse,
  HTTP_STATUS,
  ERROR_CODES,
} = require('../../utils/errorHandler');

function getAdminId(req) {
  return req.user._id || req.user.id;
}

exports.getApplicationStats = async (req, res) => {
  try {
    const stats = await getApplicationStats();
    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Application stats fetched', stats);
  } catch (err) {
    console.error('Admin career application stats error:', err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to fetch application stats',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.listApplications = async (req, res) => {
  try {
    const { page, limit, status, careerId, q, dateFrom, dateTo } = req.query;
    const result = await listApplicationsForAdmin({
      filters: { status, careerId, q, dateFrom, dateTo },
      pagination: { page, limit },
    });

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Applications fetched', {
      applications: result.applications,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('Admin list career applications error:', err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to fetch applications',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.getApplicationById = async (req, res) => {
  try {
    const result = await getApplicationById(req.params.id);

    if (result.notFound) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        'Application not found',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Application fetched', {
      application: result.application,
    });
  } catch (err) {
    console.error('Admin get career application error:', err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to fetch application',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.patchApplication = async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const { status, adminNotes } = req.body || {};
    const result = await updateApplication(req.params.id, { adminId, status, adminNotes });

    if (result.notFound) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        'Application not found',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    if (result.invalid) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        result.message,
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    if (result.statusChanged) {
      try {
        await sendApplicantStatusUpdate(result.application, {
          previousStatus: result.previousStatus,
        });
      } catch (emailError) {
        console.error('Error sending career application status update email:', emailError);
      }
    }

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Application updated', {
      application: result.application,
      statusChanged: result.statusChanged,
    });
  } catch (err) {
    console.error('Admin patch career application error:', err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to update application',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.downloadResume = async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const result = await getApplicationResumeForDownload(req.params.id);

    if (result.notFound) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        result.message || 'Application or resume not found',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    const streamResult = await getFileStreamFromR2(result.storageKey);
    if (!streamResult.success) {
      if (streamResult.notFound) {
        return sendErrorResponse(
          res,
          HTTP_STATUS.NOT_FOUND,
          'Resume file not found',
          ERROR_CODES.RESOURCE_NOT_FOUND
        );
      }
      return sendErrorResponse(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        'Failed to retrieve resume',
        ERROR_CODES.INTERNAL_SERVER_ERROR
      );
    }

    const safeFilename = String(result.originalFilename || 'resume')
      .replace(/[^\w.\-() ]/g, '_')
      .slice(0, 200);

    console.log(JSON.stringify({
      applicationId: req.params.id,
      adminId: String(adminId),
      timestamp: new Date().toISOString(),
      action: 'resume_download',
    }));

    res.setHeader('Content-Type', result.mimeType || streamResult.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    if (streamResult.contentLength) {
      res.setHeader('Content-Length', streamResult.contentLength);
    }

    streamResult.stream.pipe(res);
  } catch (err) {
    console.error('Admin resume download error:', err);
    if (!res.headersSent) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        'Failed to download resume',
        ERROR_CODES.INTERNAL_SERVER_ERROR
      );
    }
  }
};
