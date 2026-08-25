const SiteSettings = require('../models/SiteSettings');
const Admin = require('../models/Admin');
const sendMail = require('../utils/sendMail');

const STATUS_LABELS = {
  submitted: 'Submitted',
  in_review: 'In Review',
  resolved: 'Resolved',
  closed: 'Closed',
};

function getFrontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function getSourceSummary(enquiry) {
  if (enquiry.source === 'contact') {
    return enquiry.subject || 'Contact enquiry';
  }
  const category = enquiry.category ? enquiry.category.replace(/_/g, ' ') : 'General';
  return `Well-wisher feedback (${category})`;
}

async function resolveAdminRecipients() {
  const settings = await SiteSettings.findOne({}).lean();
  if (settings?.enquiryNotificationEmail) {
    return [settings.enquiryNotificationEmail];
  }

  const admins = await Admin.find({}).select('email').lean();
  return admins.map((a) => a.email).filter(Boolean);
}

async function sendCustomerSubmissionAcknowledgement(enquiry) {
  const plain = enquiry.toObject ? enquiry.toObject() : enquiry;
  const frontendUrl = getFrontendUrl();
  const hasShopper = Boolean(plain.shopper);

  const dashboardLink = hasShopper
    ? `<p>You can track your enquiry status in <a href="${frontendUrl}/shopper/enquiries/${plain._id}">My Enquiries</a>.</p>`
    : '<p>Please keep your enquiry reference number for future correspondence. Our team will respond via email.</p>';

  const html = `
    <h2>Thank you for contacting AnBazar</h2>
    <p>We have received your enquiry and our team will review it shortly.</p>
    <ul>
      <li><strong>Reference:</strong> ${plain.enquiryNumber}</li>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
      <li><strong>Subject:</strong> ${getSourceSummary(plain)}</li>
    </ul>
    <p>We typically respond within 1–2 business days.</p>
    ${dashboardLink}
  `;

  await sendMail(plain.submitter.email, `Enquiry Received — ${plain.enquiryNumber}`, html);
}

async function sendAdminNewEnquiryAlert(enquiry) {
  const plain = enquiry.toObject ? enquiry.toObject() : enquiry;
  const recipients = await resolveAdminRecipients();
  if (recipients.length === 0) {
    console.warn('No admin recipients configured for enquiry notification');
    return;
  }

  const frontendUrl = getFrontendUrl();
  const adminLink = `${frontendUrl}/admin/customer-enquiries/${plain._id}`;

  const html = `
    <h2>New Customer Enquiry</h2>
    <ul>
      <li><strong>Reference:</strong> ${plain.enquiryNumber}</li>
      <li><strong>Source:</strong> ${plain.source}</li>
      <li><strong>From:</strong> ${plain.submitter.name} (${plain.submitter.email})</li>
      <li><strong>Subject:</strong> ${getSourceSummary(plain)}</li>
      <li><strong>Message:</strong> ${String(plain.message).slice(0, 500)}${plain.message.length > 500 ? '…' : ''}</li>
    </ul>
    <p><a href="${adminLink}">View enquiry in admin panel</a></p>
  `;

  for (const to of recipients) {
    await sendMail(to, `New Enquiry — ${plain.enquiryNumber}`, html);
  }
}

async function sendCustomerStatusUpdate(enquiry, { previousStatus } = {}) {
  const plain = enquiry.toObject ? enquiry.toObject() : enquiry;
  const frontendUrl = getFrontendUrl();
  const hasShopper = Boolean(plain.shopper);

  const statusLink = hasShopper
    ? `<p><a href="${frontendUrl}/shopper/enquiries/${plain._id}">View your enquiry</a></p>`
    : `<p>Your enquiry reference is <strong>${plain.enquiryNumber}</strong>. We will keep you updated via email.</p>`;

  const html = `
    <h2>Enquiry Status Update</h2>
    <p>Your enquiry <strong>${plain.enquiryNumber}</strong> has been updated.</p>
    <ul>
      <li><strong>Previous status:</strong> ${getStatusLabel(previousStatus || 'submitted')}</li>
      <li><strong>New status:</strong> ${getStatusLabel(plain.status)}</li>
    </ul>
    ${statusLink}
  `;

  await sendMail(plain.submitter.email, `Enquiry Update — ${plain.enquiryNumber}`, html);
}

module.exports = {
  sendCustomerSubmissionAcknowledgement,
  sendAdminNewEnquiryAlert,
  sendCustomerStatusUpdate,
};
