const request = require('supertest');
const express = require('express');

jest.mock('../../services/customerEnquiryService');
jest.mock('../../services/customerEnquiryNotificationService');

const { createCustomerEnquiry } = require('../../services/customerEnquiryService');
const {
  sendCustomerSubmissionAcknowledgement,
  sendAdminNewEnquiryAlert,
} = require('../../services/customerEnquiryNotificationService');
const { createEnquiry } = require('../../controllers/customerEnquiryController');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = null;
  next();
});
app.post('/api/enquiries', createEnquiry);

describe('POST /api/enquiries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendCustomerSubmissionAcknowledgement.mockResolvedValue();
    sendAdminNewEnquiryAlert.mockResolvedValue();
  });

  it('returns 201 on successful contact submission', async () => {
    const mockEnquiry = {
      enquiryNumber: 'ENQ-20260608-123456',
      status: 'submitted',
      createdAt: new Date(),
      _id: 'enq1',
    };
    createCustomerEnquiry.mockResolvedValue({ enquiry: mockEnquiry });

    const response = await request(app)
      .post('/api/enquiries')
      .send({
        source: 'contact',
        subject: 'Order issue',
        message: 'I need help with my order delivery.',
        submitter: { name: 'Jane', email: 'jane@example.com' },
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.enquiryNumber).toBe('ENQ-20260608-123456');
    expect(response.body.data.id).toBeUndefined();
    expect(sendCustomerSubmissionAcknowledgement).toHaveBeenCalled();
    expect(sendAdminNewEnquiryAlert).toHaveBeenCalled();
  });

  it('returns 400 on validation error', async () => {
    createCustomerEnquiry.mockResolvedValue({ invalid: true, message: 'Invalid source.' });

    const response = await request(app)
      .post('/api/enquiries')
      .send({ source: 'invalid', message: 'test', submitter: { email: 'a@b.com' } })
      .expect(400);

    expect(response.body.success).toBe(false);
  });

  it('still returns 201 when email notification fails', async () => {
    const mockEnquiry = {
      enquiryNumber: 'ENQ-20260608-999999',
      status: 'submitted',
      createdAt: new Date(),
    };
    createCustomerEnquiry.mockResolvedValue({ enquiry: mockEnquiry });
    sendCustomerSubmissionAcknowledgement.mockRejectedValue(new Error('SMTP down'));

    const response = await request(app)
      .post('/api/enquiries')
      .send({
        source: 'well-wisher',
        category: 'bug',
        message: 'Found a bug on checkout page.',
        submitter: { name: 'Bob', email: 'bob@example.com' },
      })
      .expect(201);

    expect(response.body.success).toBe(true);
  });
});
