require('dotenv').config();

const request = require('supertest');
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Admin = require('../../models/Admin');
const {
  updateAdminProfile,
  changeAdminPassword,
  loginAdmin,
} = require('../../controllers/adminController');

describe('Admin profile password update', () => {
  let mongoServer;
  let app;
  let admin;
  const initialPassword = 'Test@Pass123';

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());

    const parseProfileForm = multer().none();

    const attachAdmin = (req, _res, next) => {
      req.user = { id: req.headers['x-admin-id'], role: 'admin', tokenVersion: 0 };
      next();
    };

    app.put('/admin/update', attachAdmin, parseProfileForm, updateAdminProfile);
    app.put('/admin/change-password', attachAdmin, changeAdminPassword);
    app.post('/admin/login', loginAdmin);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Admin.deleteMany({});

    admin = await Admin.create({
      name: 'Profile Test Admin',
      username: 'profileadmin',
      email: 'profile@example.com',
      phone: '+1234567890',
      password: initialPassword,
      isSuperAdmin: true,
      tokenVersion: 0,
    });
  });

  it('updateAdminProfile hashes password only once and allows login with new password', async () => {
    const newPassword = 'Profile@Pass123';

    const updateResponse = await request(app)
      .put('/admin/update')
      .set('x-admin-id', admin._id.toString())
      .field('name', admin.name)
      .field('email', admin.email)
      .field('username', admin.username)
      .field('phone', admin.phone)
      .field('password', newPassword)
      .expect(200);

    expect(updateResponse.body.success).toBe(true);

    const updated = await Admin.findById(admin._id);
    expect(updated.tokenVersion).toBe(1);
    expect(await updated.comparePassword(newPassword)).toBe(true);
    expect(await updated.comparePassword(initialPassword)).toBe(false);

    const loginResponse = await request(app)
      .post('/admin/login')
      .send({ emailOrUsername: admin.email, password: newPassword })
      .expect(200);

    expect(loginResponse.body.success).toBe(true);
    expect(loginResponse.body.data.token).toEqual(expect.any(String));
  });

  it('updateAdminProfile updates profile fields without tokenVersion bump when password omitted', async () => {
    const updateResponse = await request(app)
      .put('/admin/update')
      .set('x-admin-id', admin._id.toString())
      .field('name', 'Updated Name')
      .field('email', 'updated@example.com')
      .field('username', 'updatedadmin')
      .field('phone', '+1987654321')
      .expect(200);

    expect(updateResponse.body.success).toBe(true);

    const updated = await Admin.findById(admin._id);
    expect(updated.name).toBe('Updated Name');
    expect(updated.email).toBe('updated@example.com');
    expect(updated.username).toBe('updatedadmin');
    expect(updated.phone).toBe('+1987654321');
    expect(updated.tokenVersion).toBe(0);
    expect(await updated.comparePassword(initialPassword)).toBe(true);
  });

  it('changeAdminPassword rejects weak new passwords', async () => {
    const response = await request(app)
      .put('/admin/change-password')
      .set('x-admin-id', admin._id.toString())
      .send({ oldPassword: initialPassword, newPassword: 'password1' })
      .expect(400);

    expect(response.body.message).toBe('Password does not meet requirements');
    expect(response.body.details.validationErrors[0]).toContain('special character');
  });

  it('changeAdminPassword hashes password only once and rejects old password', async () => {
    const newPassword = 'Change@Pass123';

    const changeResponse = await request(app)
      .put('/admin/change-password')
      .set('x-admin-id', admin._id.toString())
      .send({ oldPassword: initialPassword, newPassword })
      .expect(200);

    expect(changeResponse.body.success).toBe(true);

    const updated = await Admin.findById(admin._id);
    expect(updated.tokenVersion).toBe(1);
    expect(await updated.comparePassword(newPassword)).toBe(true);
    expect(await updated.comparePassword(initialPassword)).toBe(false);
  });
});
