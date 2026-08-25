const {
  listPublicCareers,
  getPublicCareerBySlug,
} = require('../services/careerService');
const {
  sendSuccessResponse,
  sendErrorResponse,
  HTTP_STATUS,
  ERROR_CODES,
} = require('../utils/errorHandler');

function getBaseUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

exports.listCareers = async (req, res) => {
  try {
    const { page, limit, department, employmentType } = req.query;
    const result = await listPublicCareers({
      filters: { department, employmentType },
      pagination: { page, limit },
    });

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Careers fetched', {
      careers: result.careers,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('Public list careers error:', err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to fetch careers',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.getCareerBySlug = async (req, res) => {
  try {
    const result = await getPublicCareerBySlug(req.params.slug, getBaseUrl());

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
    console.error('Public get career by slug error:', err);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to fetch career',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};
