const {
  listEnquiriesForAdmin,
  getEnquiryById,
  updateEnquiry,
  getEnquiryStats,
} = require('../../services/customerEnquiryService');
const { sendCustomerStatusUpdate } = require('../../services/customerEnquiryNotificationService');

exports.listEnquiries = async (req, res) => {
  try {
    const { page, limit, status, source, category, q, dateFrom, dateTo, orderId } = req.query;

    const result = await listEnquiriesForAdmin({
      filters: { status, source, category, q, dateFrom, dateTo, orderId },
      pagination: { page, limit },
    });

    res.json({
      success: true,
      enquiries: result.enquiries,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('Admin list enquiries error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch enquiries' });
  }
};

exports.getEnquiryStats = async (req, res) => {
  try {
    const stats = await getEnquiryStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('Enquiry stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch enquiry stats' });
  }
};

exports.getEnquiryById = async (req, res) => {
  try {
    const result = await getEnquiryById(req.params.id, { role: 'admin' });

    if (result.notFound) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }

    res.json({
      success: true,
      data: result.enquiry,
    });
  } catch (err) {
    console.error('Admin get enquiry error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch enquiry' });
  }
};

exports.patchEnquiry = async (req, res) => {
  try {
    const adminId = req.user._id || req.user.id;
    const { status, adminNotes } = req.body || {};

    const result = await updateEnquiry(req.params.id, { adminId, status, adminNotes });

    if (result.notFound) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }

    if (result.invalid) {
      return res.status(400).json({ success: false, message: result.message });
    }

    if (result.statusChanged) {
      try {
        await sendCustomerStatusUpdate(result.enquiry, { previousStatus: result.previousStatus });
      } catch (emailError) {
        console.error('Error sending enquiry status update email:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Enquiry updated',
      data: {
        id: result.enquiry._id,
        status: result.enquiry.status,
        adminNotes: result.enquiry.adminNotes,
        statusHistory: result.enquiry.statusHistory,
      },
    });
  } catch (err) {
    console.error('Admin patch enquiry error:', err);
    res.status(500).json({ success: false, message: 'Failed to update enquiry' });
  }
};
