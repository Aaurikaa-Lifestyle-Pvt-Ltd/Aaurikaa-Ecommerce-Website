const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../helpers/testApp');
const CustomerEnquiry = require('../../models/CustomerEnquiry');
const Shopper = require('../../models/Shopper');
const Admin = require('../../models/Admin');

jest.mock('../../utils/sendMail', () => jest.fn().mockResolvedValue());

describe('Customer enquiry workflow integration', () => {
  let shopper;
  let shopperB;
  let admin;
  let shopperToken;
  let shopperBToken;
  let adminToken;
  const ts = Date.now();

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-blog-db');
    }
  });

  beforeEach(async () => {
    await CustomerEnquiry.deleteMany({});
    await Shopper.deleteMany({ email: /enquiry-test/ });
    await Admin.deleteMany({ email: /enquiry-test/ });

    shopper = await Shopper.create({
      firstName: 'Test',
      lastName: 'Shopper',
      username: `enquirytestshopper${ts}`,
      email: 'enquiry-test-shopper@example.com',
      password: await bcrypt.hash('Test123!@#', 10),
    });

    shopperB = await Shopper.create({
      firstName: 'Other',
      lastName: 'Shopper',
      username: `enquirytestshopperb${ts}`,
      email: 'enquiry-test-shopper-b@example.com',
      password: await bcrypt.hash('Test123!@#', 10),
    });

    admin = await Admin.create({
      name: 'Test Admin',
      username: `enquirytestadmin${ts}`,
      email: 'enquiry-test-admin@example.com',
      password: await bcrypt.hash('Test123!@#', 10),
    });

    shopperToken = jwt.sign({ id: shopper._id, role: 'shopper' }, process.env.JWT_SECRET);
    shopperBToken = jwt.sign({ id: shopperB._id, role: 'shopper' }, process.env.JWT_SECRET);
    adminToken = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET);
  });

  it('creates contact enquiry as guest and admin can update status', async () => {
    const createRes = await request(app)
      .post('/api/enquiries')
      .send({
        source: 'contact',
        subject: 'Payment query',
        message: 'I have a question about my payment.',
        submitter: { name: 'Guest User', email: 'guest@example.com', phone: '9999999999' },
      })
      .expect(201);

    expect(createRes.body.data.enquiryNumber).toMatch(/^ENQ-/);
    expect(createRes.body.data.id).toBeUndefined();

    const enquiry = await CustomerEnquiry.findOne({ enquiryNumber: createRes.body.data.enquiryNumber });
    expect(enquiry).toBeTruthy();
    expect(enquiry.status).toBe('submitted');

    const listRes = await request(app)
      .get('/api/admin/enquiries')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(listRes.body.enquiries.length).toBeGreaterThanOrEqual(1);

    const patchRes = await request(app)
      .patch(`/api/admin/enquiries/${enquiry._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'in_review' })
      .expect(200);

    expect(patchRes.body.data.status).toBe('in_review');
  });

  it('links enquiry to logged-in shopper', async () => {
    const createRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({
        source: 'well-wisher',
        category: 'feature',
        message: 'Please add dark mode to the website.',
        submitter: { name: 'Test Shopper', email: shopper.email },
      })
      .expect(201);

    expect(createRes.body.data.id).toBeDefined();

    const listRes = await request(app)
      .get('/api/shopper/enquiries')
      .set('Authorization', `Bearer ${shopperToken}`)
      .expect(200);

    expect(listRes.body.enquiries.length).toBe(1);
    expect(listRes.body.enquiries[0].enquiryNumber).toBe(createRes.body.data.enquiryNumber);
  });

  it('returns 401 for unauthenticated shopper list', async () => {
    await request(app).get('/api/shopper/enquiries').expect(401);
  });

  it('returns 404 when shopper B requests shopper A enquiry detail', async () => {
    const createRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({
        source: 'contact',
        subject: 'Private issue',
        message: 'This enquiry belongs to shopper A only.',
        submitter: { name: 'Test Shopper', email: shopper.email },
      })
      .expect(201);

    const enquiryId = createRes.body.data.id;
    expect(enquiryId).toBeDefined();

    const detailRes = await request(app)
      .get(`/api/shopper/enquiries/${enquiryId}`)
      .set('Authorization', `Bearer ${shopperBToken}`)
      .expect(404);

    expect(detailRes.body.success).toBe(false);
    expect(detailRes.body.data).toBeUndefined();
    expect(detailRes.body.message).toMatch(/not found/i);
  });

  it('creates anonymous well-wisher enquiry with valid email', async () => {
    const createRes = await request(app)
      .post('/api/enquiries')
      .send({
        source: 'well-wisher',
        category: 'experience',
        message: 'Anonymous feedback about shopping experience.',
        submitter: {
          name: 'Should be ignored',
          email: 'anonymous-guest@example.com',
          anonymous: true,
        },
      })
      .expect(201);

    expect(createRes.body.data.enquiryNumber).toMatch(/^ENQ-/);

    const enquiry = await CustomerEnquiry.findOne({
      enquiryNumber: createRes.body.data.enquiryNumber,
    });
    expect(enquiry).toBeTruthy();
    expect(enquiry.submitter.name).toBe('Anonymous');
    expect(enquiry.submitter.email).toBe('anonymous-guest@example.com');
    expect(enquiry.submitter.anonymous).toBe(true);
  });

  it('rejects anonymous well-wisher enquiry without email', async () => {
    const createRes = await request(app)
      .post('/api/enquiries')
      .send({
        source: 'well-wisher',
        category: 'bug',
        message: 'Anonymous bug report without email.',
        submitter: {
          name: 'Anonymous',
          anonymous: true,
        },
      })
      .expect(400);

    expect(createRes.body.success).toBe(false);
    expect(createRes.body.message).toMatch(/valid submitter email/i);
  });
});
