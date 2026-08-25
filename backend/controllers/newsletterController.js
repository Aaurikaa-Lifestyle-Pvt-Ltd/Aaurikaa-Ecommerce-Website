const NewsletterSubscription = require('../models/NewsletterSubscription');
const SiteSettings = require('../models/SiteSettings');
const sendMail = require('../utils/sendMail');

// @desc    Subscribe to newsletter
// @route   POST /api/newsletter/subscribe
// @access  Public
const subscribeNewsletter = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }

  // Basic email regex validation
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
  }

  try {
    const existingSubscription = await NewsletterSubscription.findOne({ email });

    if (existingSubscription) {
      return res.status(409).json({ success: false, message: 'Email already subscribed.' });
    }

    const newSubscription = new NewsletterSubscription({ email });
    await newSubscription.save();

    // Trigger notification email if configured
    try {
      const settings = await SiteSettings.findOne({});
      if (settings && settings.subscriptionNotificationEmail) {
        const subject = 'New Newsletter Subscriber';
        const html = `
          <h3>New Newsletter Subscription</h3>
          <p>A new user has subscribed to the newsletter:</p>
          <ul>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Date:</strong> ${new Date().toLocaleString()}</li>
          </ul>
        `;
        await sendMail(settings.subscriptionNotificationEmail, subject, html);
      }
    } catch (settingError) {
      console.error('Error sending subscription notification:', settingError);
      // Don't fail the registration if notification fails
    }

    res.status(201).json({
      success: true,
      message: 'Subscription successful!',
      data: {
        email: newSubscription.email,
        subscribedAt: newSubscription.subscribedAt
      }
    });
  } catch (error) {
    console.error('Error subscribing to newsletter:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// @desc    Get all newsletter subscribers (paginated)
// @route   GET /api/newsletter
// @access  Private/Admin
const getAllSubscribers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const total = await NewsletterSubscription.countDocuments();
    const subscribers = await NewsletterSubscription.find({})
      .sort({ subscribedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: subscribers,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching newsletter subscribers:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// @desc    Get subscriber by ID
// @route   GET /api/newsletter/:id
// @access  Private/Admin
const getSubscriberById = async (req, res) => {
  try {
    const subscriber = await NewsletterSubscription.findById(req.params.id);
    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }
    res.status(200).json({ success: true, data: subscriber });
  } catch (error) {
    console.error('Error fetching subscriber details:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// @desc    Export subscribers as CSV
// @route   GET /api/newsletter/export
// @access  Private/Admin
const exportSubscribers = async (req, res) => {
  try {
    const subscribers = await NewsletterSubscription.find({}).sort({ subscribedAt: -1 });

    let csv = 'Email,Subscribed At\n';
    subscribers.forEach(sub => {
      csv += `${sub.email},${new Date(sub.subscribedAt).toLocaleString()}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=subscribers.csv');
    res.status(200).send(csv);
  } catch (error) {
    console.error('Error exporting subscribers:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

module.exports = {
  subscribeNewsletter,
  getAllSubscribers,
  getSubscriberById,
  exportSubscribers
};