const SiteSettings = require('../models/SiteSettings');
const Admin = require('../models/Admin');
const sendMail = require('../utils/sendMail');

const STATUS_LABELS = {
  submitted: 'Submitted',
  in_review: 'In Review',
  shortlisted: 'Shortlisted',
  rejected: 'Rejected',
  hired: 'Hired',
  withdrawn: 'Withdrawn',
  closed: 'Closed',
};

function getFrontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

async function resolveAdminRecipients() {
  const settings = await SiteSettings.findOne({}).lean();
  if (settings?.careerNotificationEmail) {
    return [settings.careerNotificationEmail];
  }

  const admins = await Admin.find({}).select('email').lean();
  return admins.map((a) => a.email).filter(Boolean);
}

async function sendApplicantSubmissionAcknowledgement(application) {
  const plain = application.toObject ? application.toObject() : application;
  const frontendUrl = getFrontendUrl();
  const successLink = `${frontendUrl}/careers/${plain.careerSlug}/apply/success?ref=${encodeURIComponent(plain.applicationNumber)}`;

  const html = `
    <h2>Application Received — ${plain.careerTitle}</h2>
    <p>Thank you for applying to AnBazar. We have received your application and our team will review it shortly.</p>
    <ul>
      <li><strong>Reference:</strong> ${plain.applicationNumber}</li>
      <li><strong>Position:</strong> ${plain.careerTitle}</li>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
    </ul>
    <p>Please keep your reference number for future correspondence.</p>
    <p><a href="${successLink}">View application confirmation</a></p>
  `;

  await sendMail(
    plain.applicant.email,
    `Application Received — ${plain.applicationNumber}`,
    html
  );
}

async function sendAdminNewApplicationAlert(application) {
  const plain = application.toObject ? application.toObject() : application;
  const recipients = await resolveAdminRecipients();
  if (recipients.length === 0) {
    console.warn('No admin recipients configured for career application notification');
    return;
  }

  const frontendUrl = getFrontendUrl();
  const adminLink = `${frontendUrl}/admin/career-applications/${plain._id}`;

  const html = `
    <h2>New Career Application</h2>
    <ul>
      <li><strong>Reference:</strong> ${plain.applicationNumber}</li>
      <li><strong>Position:</strong> ${plain.careerTitle}</li>
      <li><strong>Applicant:</strong> ${plain.applicant.name} (${plain.applicant.email})</li>
      ${plain.applicant.phone ? `<li><strong>Phone:</strong> ${plain.applicant.phone}</li>` : ''}
      ${plain.coverLetter ? `<li><strong>Cover letter:</strong> ${String(plain.coverLetter).slice(0, 500)}${plain.coverLetter.length > 500 ? '…' : ''}</li>` : ''}
    </ul>
    <p><a href="${adminLink}">View application in admin panel</a></p>
  `;

  for (const to of recipients) {
    await sendMail(to, `New Career Application — ${plain.applicationNumber}`, html);
  }
}

async function sendApplicantStatusUpdate(application, { previousStatus } = {}) {
  const plain = application.toObject ? application.toObject() : application;

  const html = `
    <h2>Application Status Update</h2>
    <p>Your application <strong>${plain.applicationNumber}</strong> for <strong>${plain.careerTitle}</strong> has been updated.</p>
    <ul>
      <li><strong>Previous status:</strong> ${getStatusLabel(previousStatus || 'submitted')}</li>
      <li><strong>New status:</strong> ${getStatusLabel(plain.status)}</li>
    </ul>
    <p>If you have questions, please reply to this email and include your reference number.</p>
  `;

  await sendMail(
    plain.applicant.email,
    `Application Update — ${plain.applicationNumber}`,
    html
  );
}

module.exports = {
  sendApplicantSubmissionAcknowledgement,
  sendAdminNewApplicationAlert,
  sendApplicantStatusUpdate,
};
