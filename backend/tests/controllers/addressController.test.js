const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const addressController = require('../../controllers/addressController');
const Address = require('../../models/Address');
const Country = require('../../models/location/Country');
const State = require('../../models/location/State');
const District = require('../../models/location/District');

describe('Address Controller Tests', () => {
  let app;
  let testCountry, testState, testDistrict;
  let mockUser;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test');
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    app.use((req, res, next) => {
      req.user = { id: 'test_user_id', role: 'admin' };
      next();
    });

    // Setup routes
    app.get('/countries', addressController.getCountries);
    app.get('/states/:countryId', addressController.getStatesByCountry);
    app.get('/districts/:stateId', addressController.getDistrictsByState);
    app.get('/addresses', addressController.getUserAddresses);
    app.get('/addresses/default', addressController.getDefaultAddress);
    app.get('/addresses/:id', addressController.getAddressById);
    app.post('/addresses', addressController.createAddress);
    app.put('/addresses/:id', addressController.updateAddress);
    app.delete('/addresses/:id', addressController.deleteAddress);
    app.patch('/addresses/:id/default', addressController.setDefaultAddress);

    // Create test location data
    testCountry = await Country.create({
      name: 'India',
      code: 'IN',
      phoneCode: '+91'
    });

    testState = await State.create({
      name: 'Maharashtra',
      country: testCountry._id,
      code: 'MH'
    });

    testDistrict = await District.create({
      name: 'Mumbai',
      state: testState._id,
      code: 'MUM'
    });

    mockUser = {
      id: 'test_user_id',
      role: 'admin'
    };
  });

  afterEach(async () => {
    // Clean up test data
    await Address.deleteMany({});
    await Country.deleteMany({});
    await State.deleteMany({});
    await District.deleteMany({});
  });

  describe('Location Data Endpoints', () => {
    it('should get all countries', async () => {
      const response = await request(app)
        .get('/countries');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('India');
    });

    it('should get states by country', async () => {
      const response = await request(app)
        .get(`/states/${testCountry._id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Maharashtra');
    });

    it('should get districts by state', async () => {
      const response = await request(app)
        .get(`/districts/${testState._id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Mumbai');
    });
  });

  describe('Address CRUD Operations', () => {
    it('should create a new address', async () => {
      const addressData = {
        type: 'home',
        addressLine1: '123 Main Street',
        addressLine2: 'Apt 4B',
        landmark: 'Near Central Park',
        city: 'Mumbai',
        pincode: '400001',
        contactName: 'John Doe',
        contactPhone: '9876543210',
        contactEmail: 'john@example.com',
        country: testCountry._id,
        state: testState._id,
        district: testDistrict._id,
        instructions: 'Ring the doorbell twice',
        isDefault: true
      };

      const response = await request(app)
        .post('/addresses')
        .send(addressData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.addressLine1).toBe('123 Main Street');
      expect(response.body.data.isDefault).toBe(true);
    });

    it('should validate required fields when creating address', async () => {
      const response = await request(app)
        .post('/addresses')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Address line 1 is required');
    });

    it('should validate phone number format', async () => {
      const addressData = {
        addressLine1: '123 Main Street',
        city: 'Mumbai',
        pincode: '400001',
        contactName: 'John Doe',
        contactPhone: '123', // Invalid phone
        country: testCountry._id,
        state: testState._id,
        district: testDistrict._id
      };

      const response = await request(app)
        .post('/addresses')
        .send(addressData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Valid contact phone is required');
    });

    it('should validate pincode format', async () => {
      const addressData = {
        addressLine1: '123 Main Street',
        city: 'Mumbai',
        pincode: '123', // Invalid pincode
        contactName: 'John Doe',
        contactPhone: '9876543210',
        country: testCountry._id,
        state: testState._id,
        district: testDistrict._id
      };

      const response = await request(app)
        .post('/addresses')
        .send(addressData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Valid pincode is required');
    });

    it('should get user addresses', async () => {
      // Create a test address
      const address = await Address.create({
        user: 'test_user_id',
        userType: 'Admin',
        addressLine1: '123 Main Street',
        city: 'Mumbai',
        pincode: '400001',
        contactName: 'John Doe',
        contactPhone: '9876543210',
        country: testCountry._id,
        state: testState._id,
        district: testDistrict._id
      });

      const response = await request(app)
        .get('/addresses');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].addressLine1).toBe('123 Main Street');
    });

    it('should get default address', async () => {
      // Create a test address with default flag
      const address = await Address.create({
        user: 'test_user_id',
        userType: 'Admin',
        addressLine1: '123 Main Street',
        city: 'Mumbai',
        pincode: '400001',
        contactName: 'John Doe',
        contactPhone: '9876543210',
        country: testCountry._id,
        state: testState._id,
        district: testDistrict._id,
        isDefault: true
      });

      const response = await request(app)
        .get('/addresses/default');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isDefault).toBe(true);
    });

    it('should return 404 when no default address found', async () => {
      const response = await request(app)
        .get('/addresses/default');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('No default address found');
    });

    it('should update address', async () => {
      // Create a test address
      const address = await Address.create({
        user: 'test_user_id',
        userType: 'Admin',
        addressLine1: '123 Main Street',
        city: 'Mumbai',
        pincode: '400001',
        contactName: 'John Doe',
        contactPhone: '9876543210',
        country: testCountry._id,
        state: testState._id,
        district: testDistrict._id
      });

      const updateData = {
        addressLine1: '456 Updated Street',
        contactName: 'Jane Doe'
      };

      const response = await request(app)
        .put(`/addresses/${address._id}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.addressLine1).toBe('456 Updated Street');
      expect(response.body.data.contactName).toBe('Jane Doe');
    });

    it('should set address as default', async () => {
      // Create two test addresses
      const address1 = await Address.create({
        user: 'test_user_id',
        userType: 'Admin',
        addressLine1: '123 Main Street',
        city: 'Mumbai',
        pincode: '400001',
        contactName: 'John Doe',
        contactPhone: '9876543210',
        country: testCountry._id,
        state: testState._id,
        district: testDistrict._id,
        isDefault: true
      });

      const address2 = await Address.create({
        user: 'test_user_id',
        userType: 'Admin',
        addressLine1: '456 Second Street',
        city: 'Mumbai',
        pincode: '400002',
        contactName: 'Jane Doe',
        contactPhone: '9876543211',
        country: testCountry._id,
        state: testState._id,
        district: testDistrict._id,
        isDefault: false
      });

      const response = await request(app)
        .patch(`/addresses/${address2._id}/default`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isDefault).toBe(true);

      // Verify that the first address is no longer default
      const updatedAddress1 = await Address.findById(address1._id);
      expect(updatedAddress1.isDefault).toBe(false);
    });

    it('should delete address (deactivate)', async () => {
      // Create a test address
      const address = await Address.create({
        user: 'test_user_id',
        userType: 'Admin',
        addressLine1: '123 Main Street',
        city: 'Mumbai',
        pincode: '400001',
        contactName: 'John Doe',
        contactPhone: '9876543210',
        country: testCountry._id,
        state: testState._id,
        district: testDistrict._id
      });

      const response = await request(app)
        .delete(`/addresses/${address._id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify address is deactivated
      const deletedAddress = await Address.findById(address._id);
      expect(deletedAddress.isActive).toBe(false);
    });

    it('should return 404 for non-existent address', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .get(`/addresses/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Address not found');
    });
  });

  describe('Address Validation', () => {
    it('should validate location hierarchy', async () => {
      const addressData = {
        addressLine1: '123 Main Street',
        city: 'Mumbai',
        pincode: '400001',
        contactName: 'John Doe',
        contactPhone: '9876543210',
        country: testCountry._id,
        state: testState._id,
        district: new mongoose.Types.ObjectId() // Wrong district
      };

      const response = await request(app)
        .post('/addresses')
        .send(addressData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid district for selected state');
    });

    it('should validate address type', async () => {
      const addressData = {
        type: 'invalid_type',
        addressLine1: '123 Main Street',
        city: 'Mumbai',
        pincode: '400001',
        contactName: 'John Doe',
        contactPhone: '9876543210',
        country: testCountry._id,
        state: testState._id,
        district: testDistrict._id
      };

      const response = await request(app)
        .post('/addresses')
        .send(addressData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid address type');
    });
  });
});
