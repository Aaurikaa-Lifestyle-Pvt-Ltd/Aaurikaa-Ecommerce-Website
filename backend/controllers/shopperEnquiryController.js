const {
  listEnquiriesForShopper,
  getEnquiryById,
} = require('../services/customerEnquiryService');

exports.listShopperEnquiries = async (req, res) => {
  try {
    const shopperId = req.user._id || req.user.id;
    const { page, limit, status } = req.query;

    const result = await listEnquiriesForShopper(shopperId, {
      filters: { status },
      pagination: { page, limit },
    });

    res.json({
      success: true,
      enquiries: result.enquiries,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('List shopper enquiries error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch enquiries' });
  }
};

exports.getShopperEnquiryById = async (req, res) => {
  try {
    const shopperId = req.user._id || req.user.id;
    const result = await getEnquiryById(req.params.id, { role: 'shopper', userId: shopperId });

    if (result.notFound) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }

    res.json({
      success: true,
      data: result.enquiry,
    });
  } catch (err) {
    console.error('Get shopper enquiry error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch enquiry' });
  }
};
