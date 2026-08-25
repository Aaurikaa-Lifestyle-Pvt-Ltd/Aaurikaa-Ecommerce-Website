const { createCustomerEnquiry } = require('../services/customerEnquiryService');
const {
  sendCustomerSubmissionAcknowledgement,
  sendAdminNewEnquiryAlert,
} = require('../services/customerEnquiryNotificationService');

exports.createEnquiry = async (req, res) => {
  try {
    const shopperId = req.user ? (req.user._id || req.user.id) : null;

    const result = await createCustomerEnquiry(req.body, { shopperId });

    if (result.invalid) {
      return res.status(result.statusCode || 400).json({
        success: false,
        message: result.message,
      });
    }

    const { enquiry } = result;

    try {
      await sendCustomerSubmissionAcknowledgement(enquiry);
      await sendAdminNewEnquiryAlert(enquiry);
    } catch (emailError) {
      console.error('Error sending enquiry notification emails:', emailError);
    }

    const responseData = {
      enquiryNumber: enquiry.enquiryNumber,
      status: enquiry.status,
      createdAt: enquiry.createdAt,
    };

    if (shopperId) {
      responseData.id = enquiry._id;
    }

    res.status(201).json({
      success: true,
      message: 'Your enquiry has been submitted successfully.',
      data: responseData,
    });
  } catch (err) {
    console.error('Create enquiry error:', err);
    res.status(500).json({ success: false, message: 'Failed to submit enquiry. Please try again later.' });
  }
};
