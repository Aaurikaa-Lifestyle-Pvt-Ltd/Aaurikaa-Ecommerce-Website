const Career = require('../../models/Career');
const {
  validateCreatePayload,
  validateUpdatePayload,
  validateDisplayOrder,
  STATUSES,
  EMPLOYMENT_TYPES,
} = require('../../services/careerService');

function validateCreateCareerBody(req, res, next) {
  const result = validateCreatePayload(req.body || {});
  if (!result.valid) {
    return res.status(400).json({ success: false, message: result.message });
  }
  next();
}

async function validateUpdateCareerBody(req, res, next) {
  try {
    const existing = await Career.findById(req.params.id).select('startDate endDate').lean();
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Career not found' });
    }

    const result = validateUpdatePayload(req.body || {}, existing);
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.message });
    }
    next();
  } catch (err) {
    console.error('Career update validation error:', err);
    return res.status(500).json({ success: false, message: 'Validation failed' });
  }
}

function validateStatusBody(req, res, next) {
  const { status } = req.body || {};
  if (!status || !STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Allowed: ${STATUSES.join(', ')}`,
    });
  }
  next();
}

function validateReorderBody(req, res, next) {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Request body must include a non-empty items array.',
    });
  }

  for (const item of items) {
    if (item.displayOrder != null) {
      const orderCheck = validateDisplayOrder(item.displayOrder);
      if (!orderCheck.valid) {
        return res.status(400).json({ success: false, message: orderCheck.message });
      }
    }
  }

  next();
}

module.exports = {
  validateCreateCareerBody,
  validateUpdateCareerBody,
  validateStatusBody,
  validateReorderBody,
  STATUSES,
  EMPLOYMENT_TYPES,
};
