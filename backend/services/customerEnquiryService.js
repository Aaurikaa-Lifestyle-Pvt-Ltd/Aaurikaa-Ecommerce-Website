const CustomerEnquiry = require('../models/CustomerEnquiry');
const Order = require('../models/Order');
const {
  SOURCES,
  CATEGORIES,
  STATUSES,
  EMAIL_REGEX,
} = require('../models/CustomerEnquiry');

const ADMIN_NOTES_MAX = 1000;

const ALLOWED_TRANSITIONS = {
  submitted: ['in_review', 'resolved', 'closed'],
  in_review: ['resolved', 'closed'],
  resolved: ['closed'],
  closed: [],
};

function generateEnquiryNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `ENQ-${year}${month}${day}-${random}`;
}

function assertValidStatusTransition(from, to) {
  if (!from || !to || from === to) {
    return { valid: false, message: 'Invalid status transition' };
  }
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    return { valid: false, message: `Cannot transition from "${from}" to "${to}"` };
  }
  return { valid: true };
}

function appendStatusHistory(enquiry, entry) {
  enquiry.statusHistory.push({
    status: entry.status,
    previousStatus: entry.previousStatus ?? null,
    changedBy: entry.changedBy ?? null,
    changedAt: entry.changedAt || new Date(),
    note: entry.note ?? null,
  });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function orderEmailMatches(order, submitterEmail) {
  const email = normalizeEmail(submitterEmail);
  const billing = normalizeEmail(order.billingDetails?.email);
  const shipping = normalizeEmail(order.shippingDetails?.email);
  return email && (email === billing || email === shipping);
}

async function validateOrderLink({ orderId, orderInvoiceNumber, submitterEmail, shopperId }) {
  if (!orderId && !orderInvoiceNumber) {
    return { valid: true, order: null, orderInvoiceNumber: null };
  }

  let order = null;

  if (orderId) {
    order = await Order.findById(orderId).select('buyer invoiceNumber billingDetails shippingDetails status').lean();
    if (!order) {
      return { valid: false, statusCode: 400, message: 'The order reference could not be verified.' };
    }

    if (shopperId) {
      const buyerId = String(order.buyer);
      if (buyerId !== String(shopperId)) {
        return { valid: false, statusCode: 403, message: 'You are not authorized to link this order.' };
      }
    } else if (!orderEmailMatches(order, submitterEmail)) {
      return { valid: false, statusCode: 400, message: 'The order reference could not be verified.' };
    }

    return {
      valid: true,
      order: order._id,
      orderInvoiceNumber: order.invoiceNumber,
    };
  }

  if (orderInvoiceNumber) {
    order = await Order.findOne({ invoiceNumber: String(orderInvoiceNumber).trim() })
      .select('buyer invoiceNumber billingDetails shippingDetails status')
      .lean();

    if (!order) {
      return { valid: false, statusCode: 400, message: 'The order reference could not be verified.' };
    }

    if (shopperId) {
      const buyerId = String(order.buyer);
      if (buyerId !== String(shopperId)) {
        return { valid: false, statusCode: 403, message: 'You are not authorized to link this order.' };
      }
    } else if (!orderEmailMatches(order, submitterEmail)) {
      return { valid: false, statusCode: 400, message: 'The order reference could not be verified.' };
    }

    return {
      valid: true,
      order: order._id,
      orderInvoiceNumber: order.invoiceNumber,
    };
  }

  return { valid: true, order: null, orderInvoiceNumber: null };
}

function validateCreatePayload(payload) {
  const errors = [];

  if (!payload.source || !SOURCES.includes(payload.source)) {
    errors.push('Invalid or missing source. Must be "contact" or "well-wisher".');
  }

  if (!payload.message || String(payload.message).trim().length < 10) {
    errors.push('Message is required and must be at least 10 characters.');
  }
  if (payload.message && String(payload.message).length > 5000) {
    errors.push('Message must not exceed 5000 characters.');
  }

  const submitter = payload.submitter || {};
  if (!submitter.email || !EMAIL_REGEX.test(submitter.email)) {
    errors.push('A valid submitter email is required.');
  }

  if (payload.source === 'contact') {
    if (!payload.subject || !String(payload.subject).trim()) {
      errors.push('Subject is required for contact enquiries.');
    }
    if (payload.subject && String(payload.subject).length > 200) {
      errors.push('Subject must not exceed 200 characters.');
    }
  }

  if (payload.source === 'well-wisher') {
    if (!payload.category || !CATEGORIES.includes(payload.category)) {
      errors.push('Category is required for well-wisher enquiries.');
    }
    if (payload.rating != null) {
      const rating = Number(payload.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        errors.push('Rating must be between 1 and 5.');
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, message: errors.join(' ') };
  }

  return { valid: true };
}

function buildSubmitter(submitter, source) {
  const anonymous = Boolean(submitter.anonymous) && source === 'well-wisher';
  const name = anonymous
    ? 'Anonymous'
    : String(submitter.name || '').trim() || 'Anonymous';

  return {
    name,
    email: normalizeEmail(submitter.email),
    phone: String(submitter.phone || submitter.mobile || '').trim(),
    anonymous,
  };
}

function toShopperDTO(enquiry) {
  const plain = enquiry.toObject ? enquiry.toObject() : enquiry;
  return {
    id: plain._id,
    enquiryNumber: plain.enquiryNumber,
    source: plain.source,
    category: plain.category,
    subject: plain.subject,
    message: plain.message,
    rating: plain.rating,
    submitter: {
      name: plain.submitter.name,
      email: plain.submitter.email,
      phone: plain.submitter.phone,
      anonymous: plain.submitter.anonymous,
    },
    orderInvoiceNumber: plain.orderInvoiceNumber,
    status: plain.status,
    statusHistory: (plain.statusHistory || []).map((h) => ({
      status: h.status,
      changedAt: h.changedAt,
    })),
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    resolvedAt: plain.resolvedAt,
    closedAt: plain.closedAt,
  };
}

function toAdminListDTO(enquiry) {
  const plain = enquiry.toObject ? enquiry.toObject() : enquiry;
  return {
    id: plain._id,
    enquiryNumber: plain.enquiryNumber,
    source: plain.source,
    category: plain.category,
    subject: plain.subject,
    message: plain.message,
    rating: plain.rating,
    submitter: plain.submitter,
    orderInvoiceNumber: plain.orderInvoiceNumber,
    status: plain.status,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

function toAdminDetailDTO(enquiry) {
  const plain = enquiry.toObject ? enquiry.toObject() : enquiry;
  const order = plain.order && typeof plain.order === 'object' ? plain.order : null;

  return {
    id: plain._id,
    enquiryNumber: plain.enquiryNumber,
    source: plain.source,
    category: plain.category,
    subject: plain.subject,
    message: plain.message,
    rating: plain.rating,
    submitter: plain.submitter,
    shopper: plain.shopper,
    order: order
      ? {
          id: order._id,
          invoiceNumber: order.invoiceNumber,
          status: order.status,
          buyerName: order.buyer
            ? `${order.buyer.firstName || ''} ${order.buyer.lastName || ''}`.trim() || order.buyer.email
            : null,
          buyerEmail: order.buyer?.email || null,
        }
      : null,
    orderInvoiceNumber: plain.orderInvoiceNumber,
    status: plain.status,
    adminNotes: plain.adminNotes,
    statusHistory: plain.statusHistory,
    resolvedAt: plain.resolvedAt,
    closedAt: plain.closedAt,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

async function createCustomerEnquiry(payload, { shopperId } = {}) {
  const validation = validateCreatePayload(payload);
  if (!validation.valid) {
    return { invalid: true, message: validation.message };
  }

  const orderValidation = await validateOrderLink({
    orderId: payload.orderId,
    orderInvoiceNumber: payload.orderInvoiceNumber,
    submitterEmail: payload.submitter?.email,
    shopperId,
  });

  if (!orderValidation.valid) {
    return {
      invalid: true,
      statusCode: orderValidation.statusCode || 400,
      message: orderValidation.message,
    };
  }

  const submitter = buildSubmitter(payload.submitter, payload.source);
  const now = new Date();

  const enquiryData = {
    enquiryNumber: generateEnquiryNumber(),
    source: payload.source,
    message: String(payload.message).trim(),
    submitter,
    status: 'submitted',
    statusHistory: [],
  };

  if (shopperId) {
    enquiryData.shopper = shopperId;
  }
  if (orderValidation.order) {
    enquiryData.order = orderValidation.order;
    enquiryData.orderInvoiceNumber = orderValidation.orderInvoiceNumber;
  }

  if (payload.source === 'contact') {
    enquiryData.subject = String(payload.subject).trim();
    if (payload.category && CATEGORIES.includes(payload.category)) {
      enquiryData.category = payload.category;
    }
  } else {
    enquiryData.category = payload.category;
    if (payload.subject) {
      enquiryData.subject = String(payload.subject).trim().slice(0, 200);
    }
    if (payload.rating != null) {
      enquiryData.rating = Number(payload.rating);
    }
  }

  const enquiry = new CustomerEnquiry(enquiryData);
  appendStatusHistory(enquiry, {
    status: 'submitted',
    previousStatus: null,
    changedBy: null,
    changedAt: now,
    note: null,
  });

  await enquiry.save();

  return { enquiry };
}

function buildAdminFilter(filters = {}) {
  const query = {};

  if (filters.status && STATUSES.includes(filters.status)) {
    query.status = filters.status;
  }
  if (filters.source && SOURCES.includes(filters.source)) {
    query.source = filters.source;
  }
  if (filters.category && CATEGORIES.includes(filters.category)) {
    query.category = filters.category;
  }
  if (filters.orderId) {
    query.order = filters.orderId;
  }
  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) {
      query.createdAt.$gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      const end = new Date(filters.dateTo);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }
  if (filters.q) {
    const regex = new RegExp(String(filters.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { enquiryNumber: regex },
      { 'submitter.email': regex },
      { 'submitter.name': regex },
      { subject: regex },
      { message: regex },
    ];
  }

  return query;
}

async function listEnquiriesForAdmin({ filters = {}, pagination = {} } = {}) {
  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(pagination.limit, 10) || 20));
  const skip = (page - 1) * limit;
  const query = buildAdminFilter(filters);

  const [totalCount, enquiries] = await Promise.all([
    CustomerEnquiry.countDocuments(query),
    CustomerEnquiry.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    enquiries: enquiries.map(toAdminListDTO),
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 0,
      totalCount,
    },
  };
}

async function listEnquiriesForShopper(shopperId, { filters = {}, pagination = {} } = {}) {
  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(pagination.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const query = { shopper: shopperId };
  if (filters.status && STATUSES.includes(filters.status)) {
    query.status = filters.status;
  }

  const [totalCount, enquiries] = await Promise.all([
    CustomerEnquiry.countDocuments(query),
    CustomerEnquiry.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
  ]);

  return {
    enquiries: enquiries.map(toShopperDTO),
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 0,
      totalCount,
    },
  };
}

async function getEnquiryById(id, { role, userId } = {}) {
  const enquiry = await CustomerEnquiry.findById(id)
    .populate({
      path: 'order',
      select: 'invoiceNumber status buyer',
      populate: { path: 'buyer', select: 'firstName lastName email' },
    });

  if (!enquiry) {
    return { notFound: true };
  }

  if (role === 'shopper') {
    if (!enquiry.shopper || String(enquiry.shopper) !== String(userId)) {
      return { notFound: true };
    }
    return { enquiry: toShopperDTO(enquiry) };
  }

  return { enquiry: toAdminDetailDTO(enquiry) };
}

async function updateEnquiry(id, { adminId, status, adminNotes }) {
  const enquiry = await CustomerEnquiry.findById(id);
  if (!enquiry) {
    return { notFound: true };
  }

  const previousStatus = enquiry.status;
  let statusChanged = false;

  if (status !== undefined && status !== null && status !== '') {
    if (!STATUSES.includes(status)) {
      return { invalid: true, message: 'Invalid status value.' };
    }

    if (status !== enquiry.status) {
      const transition = assertValidStatusTransition(enquiry.status, status);
      if (!transition.valid) {
        return { invalid: true, message: transition.message };
      }

      enquiry.status = status;
      statusChanged = true;

      if (status === 'resolved' && !enquiry.resolvedAt) {
        enquiry.resolvedAt = new Date();
      }
      if (status === 'closed' && !enquiry.closedAt) {
        enquiry.closedAt = new Date();
      }

      appendStatusHistory(enquiry, {
        status,
        previousStatus,
        changedBy: adminId,
        changedAt: new Date(),
        note: adminNotes || null,
      });
    }
  }

  if (adminNotes !== undefined) {
    const notes = adminNotes == null ? null : String(adminNotes).slice(0, ADMIN_NOTES_MAX);
    enquiry.adminNotes = notes || null;
  }

  await enquiry.save();

  return {
    enquiry,
    statusChanged,
    previousStatus,
  };
}

async function getEnquiryStats() {
  const counts = await CustomerEnquiry.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const stats = {};
  for (const s of STATUSES) {
    stats[s] = 0;
  }
  for (const row of counts) {
    if (row._id && stats[row._id] !== undefined) {
      stats[row._id] = row.count;
    }
  }
  stats.total = Object.values(stats).reduce((a, b) => a + b, 0);

  return stats;
}

module.exports = {
  generateEnquiryNumber,
  createCustomerEnquiry,
  validateOrderLink,
  listEnquiriesForAdmin,
  listEnquiriesForShopper,
  getEnquiryById,
  updateEnquiry,
  getEnquiryStats,
  assertValidStatusTransition,
  appendStatusHistory,
};
