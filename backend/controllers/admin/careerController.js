const {
  createCareer,
  updateCareer,
  updateCareerStatus,
  softDeleteCareer,
  reorderCareers,
  getCareerById,
  listCareersForAdmin,
  getCareerStats,
} = require('../../services/careerService');
const {
  sendSuccessResponse,
  sendErrorResponse,
  HTTP_STATUS,
  ERROR_CODES,
} = require('../../utils/errorHandler');

function getAdminId(req) {
  return req.user._id || req.user.id;
}

exports.getCareerStats = async (req, res) => {
  try {
    const stats = await getCareerStats();
    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Career stats fetched', stats);
  } catch (err) {
    console.error('Admin career stats error:', err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to fetch career stats',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.listCareers = async (req, res) => {
  try {
    const { page, limit, status, q, sort, order } = req.query;
    const result = await listCareersForAdmin({
      filters: { status, q },
      pagination: { page, limit },
      sort: { field: sort, order },
    });

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Careers fetched', {
      careers: result.careers,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('Admin list careers error:', err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to fetch careers',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.createCareer = async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const result = await createCareer(req.body || {}, adminId);

    if (result.invalid) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        result.message,
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    return sendSuccessResponse(res, HTTP_STATUS.CREATED, 'Career created', {
      career: result.career,
    });
  } catch (err) {
    console.error('Admin create career error:', err);
    if (err.code === 11000) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Slug already exists',
        ERROR_CODES.VALIDATION_FAILED
      );
    }
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to create career',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.getCareerById = async (req, res) => {
  try {
    const result = await getCareerById(req.params.id);

    if (result.notFound) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        'Career not found',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Career fetched', {
      career: result.career,
    });
  } catch (err) {
    console.error('Admin get career error:', err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to fetch career',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.updateCareer = async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const result = await updateCareer(req.params.id, req.body || {}, adminId);

    if (result.notFound) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        'Career not found',
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

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Career updated', {
      career: result.career,
    });
  } catch (err) {
    console.error('Admin update career error:', err);
    if (err.code === 11000) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Slug already exists',
        ERROR_CODES.VALIDATION_FAILED
      );
    }
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to update career',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.patchCareerStatus = async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const { status } = req.body || {};
    const result = await updateCareerStatus(req.params.id, status, adminId);

    if (result.notFound) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        'Career not found',
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

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Career status updated', {
      career: result.career,
    });
  } catch (err) {
    console.error('Admin patch career status error:', err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to update career status',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.reorderCareers = async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const { items } = req.body || {};
    const result = await reorderCareers(items, adminId);

    if (result.invalid) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        result.message,
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Careers reordered', {
      careers: result.careers,
    });
  } catch (err) {
    console.error('Admin reorder careers error:', err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to reorder careers',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.deleteCareer = async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const result = await softDeleteCareer(req.params.id, adminId);

    if (result.notFound) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        'Career not found',
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

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Career moved to trash', {
      career: result.career,
    });
  } catch (err) {
    console.error('Admin delete career error:', err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to delete career',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};
