/**
 * Tests for Offer Update Functionality
 * Tests the backend offer update/editing capabilities
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Import the app and models
const app = require('../../server');
const Offer = require('../../models/Offer');
const Admin = require('../../models/Admin');

// Test database setup
const testDbUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test_offers';

describe('Offer Update Functionality', () => {
  let testAdmin;
  let adminToken;
  let testOffer;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(testDbUri);
    
    // Create test admin
    testAdmin = new Admin({
      name: 'Test Admin',
      email: 'test@admin.com',
      password: 'hashedpassword',
      isVerified: true
    });
    await testAdmin.save();

    // Generate admin token
    adminToken = jwt.sign(
      { id: testAdmin._id, role: 'admin' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  beforeEach(async () => {
    // Create test offer
    testOffer = new Offer({
      text: 'Test Offer',
      title: 'Test Title',
      description: 'Test Description',
      type: 'announcement',
      priority: 1,
      validFrom: new Date('2024-01-01'),
      validTo: new Date('2024-12-31'),
      targetAudience: 'all',
      isActive: true,
      metadata: {
        createdBy: testAdmin._id,
        tags: ['test']
      }
    });
    await testOffer.save();
  });

  afterEach(async () => {
    // Clean up offers
    await Offer.deleteMany({});
  });

  afterAll(async () => {
    // Clean up admin and close connection
    await Admin.deleteMany({});
    await mongoose.connection.close();
  });

  describe('PUT /api/admin/offers/:id', () => {
    test('should update offer successfully with valid data', async () => {
      const updateData = {
        text: 'Updated Offer Text',
        title: 'Updated Title',
        description: 'Updated Description',
        type: 'promotion',
        priority: 5,
        validFrom: '2024-02-01',
        validTo: '2024-11-30',
        targetAudience: 'new',
        isActive: false
      };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.message).toBe('Offer updated successfully');
      expect(response.body.offer.text).toBe('Updated Offer Text');
      expect(response.body.offer.title).toBe('Updated Title');
      expect(response.body.offer.description).toBe('Updated Description');
      expect(response.body.offer.type).toBe('promotion');
      expect(response.body.offer.priority).toBe(5);
      expect(response.body.offer.targetAudience).toBe('new');
      expect(response.body.offer.isActive).toBe(false);
      expect(response.body.offer.metadata.lastModifiedBy).toBe(testAdmin._id.toString());
    });

    test('should update offer with partial data', async () => {
      const updateData = {
        text: 'Partially Updated Text',
        priority: 10
      };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.offer.text).toBe('Partially Updated Text');
      expect(response.body.offer.priority).toBe(10);
      // Other fields should remain unchanged
      expect(response.body.offer.title).toBe('Test Title');
      expect(response.body.offer.type).toBe('announcement');
    });

    test('should return 404 for non-existent offer', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const updateData = { text: 'Updated Text' };

      const response = await request(app)
        .put(`/api/admin/offers/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body.message).toBe('Offer not found');
    });

    test('should return 401 without admin token', async () => {
      const updateData = { text: 'Updated Text' };

      await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .send(updateData)
        .expect(401);
    });

    test('should return 401 with invalid token', async () => {
      const updateData = { text: 'Updated Text' };

      await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', 'Bearer invalid-token')
        .send(updateData)
        .expect(401);
    });

    test('should validate text length (minimum 3 characters)', async () => {
      const updateData = { text: 'AB' }; // Too short

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('Text must be at least 3 characters long');
    });

    test('should validate text length (maximum 500 characters)', async () => {
      const longText = 'A'.repeat(501); // Too long
      const updateData = { text: longText };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('Text cannot exceed 500 characters');
    });

    test('should validate title length (maximum 100 characters)', async () => {
      const longTitle = 'A'.repeat(101); // Too long
      const updateData = { title: longTitle };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('Title cannot exceed 100 characters');
    });

    test('should validate description length (maximum 1000 characters)', async () => {
      const longDescription = 'A'.repeat(1001); // Too long
      const updateData = { description: longDescription };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('Description cannot exceed 1000 characters');
    });

    test('should validate type enum values', async () => {
      const updateData = { type: 'invalid-type' };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('Type must be one of: announcement, promotion, discount, news');
    });

    test('should validate target audience enum values', async () => {
      const updateData = { targetAudience: 'invalid-audience' };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('Target audience must be one of: all, new, returning, premium');
    });

    test('should validate priority is a number', async () => {
      const updateData = { priority: 'not-a-number' };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('Priority must be a number');
    });

    test('should validate priority is non-negative', async () => {
      const updateData = { priority: -1 };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('Priority must be a non-negative number');
    });

    test('should validate date format for validFrom', async () => {
      const updateData = { validFrom: 'invalid-date' };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('Valid from must be a valid date');
    });

    test('should validate date format for validTo', async () => {
      const updateData = { validTo: 'invalid-date' };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('Valid to must be a valid date');
    });

    test('should validate isActive is boolean', async () => {
      const updateData = { isActive: 'not-boolean' };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('Is active must be a boolean value');
    });

    test('should handle multiple validation errors', async () => {
      const updateData = {
        text: 'AB', // Too short
        title: 'A'.repeat(101), // Too long
        type: 'invalid-type',
        priority: -1
      };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toHaveLength(4);
      expect(response.body.errors).toContain('Text must be at least 3 characters long');
      expect(response.body.errors).toContain('Title cannot exceed 100 characters');
      expect(response.body.errors).toContain('Type must be one of: announcement, promotion, discount, news');
      expect(response.body.errors).toContain('Priority must be a non-negative number');
    });

    test('should update tags in metadata', async () => {
      const updateData = {
        text: 'Updated Text',
        tags: ['updated', 'test', 'new']
      };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.offer.metadata.tags).toEqual(['updated', 'test', 'new']);
    });

    test('should populate createdBy and lastModifiedBy fields', async () => {
      const updateData = { text: 'Updated Text' };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.offer.metadata.createdBy).toBeDefined();
      expect(response.body.offer.metadata.lastModifiedBy).toBeDefined();
      expect(response.body.offer.metadata.lastModifiedBy).toBe(testAdmin._id.toString());
    });

    test('should handle server errors gracefully', async () => {
      // Mock Offer.findByIdAndUpdate to throw an error
      const originalFindByIdAndUpdate = Offer.findByIdAndUpdate;
      Offer.findByIdAndUpdate = jest.fn().mockRejectedValue(new Error('Database error'));

      const updateData = { text: 'Updated Text' };

      const response = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(500);

      expect(response.body.message).toBe('Server error');

      // Restore original method
      Offer.findByIdAndUpdate = originalFindByIdAndUpdate;
    });
  });
});
