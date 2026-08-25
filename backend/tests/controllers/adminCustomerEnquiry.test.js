const request = require('supertest');
const express = require('express');

jest.mock('../../services/customerEnquiryService');
jest.mock('../../services/customerEnquiryNotificationService');

const {
  listEnquiriesForAdmin,
  getEnquiryById,
  updateEnquiry,
  getEnquiryStats,
} = require('../../services/customerEnquiryService');
const { sendCustomerStatusUpdate } = require('../../services/customerEnquiryNotificationService');
const {
  listEnquiries,
  getEnquiryById: getEnquiryByIdHandler,
  patchEnquiry,
  getEnquiryStats: getEnquiryStatsHandler,
} = require('../../controllers/admin/customerEnquiryController');

const app = express();
app.use(express.json());

const mockVerifyAdmin = (req, res, next) => {
  req.user = { id: 'admin507f1f77bcf86cd799439001', role: 'admin' };
  next();
};

app.get('/api/admin/enquiries/stats', mockVerifyAdmin, getEnquiryStatsHandler);
app.get('/api/admin/enquiries', mockVerifyAdmin, listEnquiries);
app.get('/api/admin/enquiries/:id', mockVerifyAdmin, getEnquiryByIdHandler);
app.patch('/api/admin/enquiries/:id', mockVerifyAdmin, patchEnquiry);

describe('Admin customer enquiry endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendCustomerStatusUpdate.mockResolvedValue();
  });

  it('returns paginated enquiry list', async () => {
    listEnquiriesForAdmin.mockResolvedValue({
      enquiries: [{ id: 'e1', enquiryNumber: 'ENQ-20260608-000001', status: 'submitted' }],
      pagination: { page: 1, limit: 20, totalCount: 1, totalPages: 1 },
    });

    const response = await request(app)
      .get('/api/admin/enquiries?page=1&status=submitted')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.enquiries).toHaveLength(1);
  });

  it('returns enquiry stats', async () => {
    getEnquiryStats.mockResolvedValue({ submitted: 5, in_review: 2, resolved: 1, closed: 0, total: 8 });

    const response = await request(app).get('/api/admin/enquiries/stats').expect(200);

    expect(response.body.data.submitted).toBe(5);
    expect(response.body.data.total).toBe(8);
  });

  it('patches enquiry status and sends email', async () => {
    const mockEnquiry = {
      _id: 'e1',
      status: 'in_review',
      adminNotes: 'Looking into it',
      statusHistory: [{ status: 'in_review', previousStatus: 'submitted' }],
    };
    updateEnquiry.mockResolvedValue({
      enquiry: mockEnquiry,
      statusChanged: true,
      previousStatus: 'submitted',
    });

    const response = await request(app)
      .patch('/api/admin/enquiries/e1')
      .send({ status: 'in_review', adminNotes: 'Looking into it' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(sendCustomerStatusUpdate).toHaveBeenCalled();
  });

  it('rejects invalid status transition', async () => {
    updateEnquiry.mockResolvedValue({ invalid: true, message: 'Cannot transition from "closed" to "submitted"' });

    const response = await request(app)
      .patch('/api/admin/enquiries/e1')
      .send({ status: 'submitted' })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(sendCustomerStatusUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 for missing enquiry', async () => {
    getEnquiryById.mockResolvedValue({ notFound: true });

    await request(app).get('/api/admin/enquiries/missing').expect(404);
  });

  it('saves adminNotes only without sending customer email', async () => {
    const mockEnquiry = {
      _id: 'e1',
      status: 'submitted',
      adminNotes: 'Internal follow-up note',
      statusHistory: [{ status: 'submitted', previousStatus: null }],
    };
    updateEnquiry.mockResolvedValue({
      enquiry: mockEnquiry,
      statusChanged: false,
      previousStatus: 'submitted',
    });

    const response = await request(app)
      .patch('/api/admin/enquiries/e1')
      .send({ adminNotes: 'Internal follow-up note' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('submitted');
    expect(response.body.data.adminNotes).toBe('Internal follow-up note');
    expect(sendCustomerStatusUpdate).not.toHaveBeenCalled();
  });
});
