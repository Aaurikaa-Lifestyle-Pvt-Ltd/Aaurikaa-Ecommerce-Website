/**
 * Integration Tests for Offer Edit Workflow
 * Tests the complete offer editing workflow from frontend to backend
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Import the app and models
const app = require('../../server');
const Offer = require('../../models/Offer');
const Admin = require('../../models/Admin');

// Test database setup
const testDbUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test_offer_workflow';

describe('Offer Edit Workflow Integration Tests', () => {
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
      text: 'Original Offer Text',
      title: 'Original Title',
      description: 'Original Description',
      type: 'announcement',
      priority: 1,
      validFrom: new Date('2024-01-01'),
      validTo: new Date('2024-12-31'),
      targetAudience: 'all',
      isActive: true,
      metadata: {
        createdBy: testAdmin._id,
        tags: ['original']
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

  describe('Complete Offer Edit Workflow', () => {
    test('should complete full offer edit workflow successfully', async () => {
      // Step 1: Get the offer to verify initial state
      const getResponse = await request(app)
        .get(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(getResponse.body.text).toBe('Original Offer Text');
      expect(getResponse.body.title).toBe('Original Title');
      expect(getResponse.body.type).toBe('announcement');
      expect(getResponse.body.priority).toBe(1);
      expect(getResponse.body.isActive).toBe(true);

      // Step 2: Update the offer with new data
      const updateData = {
        text: 'Updated Offer Text',
        title: 'Updated Title',
        description: 'Updated Description',
        type: 'promotion',
        priority: 5,
        validFrom: '2024-02-01',
        validTo: '2024-11-30',
        targetAudience: 'new',
        isActive: false,
        tags: ['updated', 'promotion']
      };

      const updateResponse = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(updateResponse.body.message).toBe('Offer updated successfully');
      expect(updateResponse.body.offer.text).toBe('Updated Offer Text');
      expect(updateResponse.body.offer.title).toBe('Updated Title');
      expect(updateResponse.body.offer.description).toBe('Updated Description');
      expect(updateResponse.body.offer.type).toBe('promotion');
      expect(updateResponse.body.offer.priority).toBe(5);
      expect(updateResponse.body.offer.targetAudience).toBe('new');
      expect(updateResponse.body.offer.isActive).toBe(false);
      expect(updateResponse.body.offer.metadata.tags).toEqual(['updated', 'promotion']);
      expect(updateResponse.body.offer.metadata.lastModifiedBy).toBe(testAdmin._id.toString());

      // Step 3: Verify the offer was updated in the database
      const verifyResponse = await request(app)
        .get(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(verifyResponse.body.text).toBe('Updated Offer Text');
      expect(verifyResponse.body.title).toBe('Updated Title');
      expect(verifyResponse.body.description).toBe('Updated Description');
      expect(verifyResponse.body.type).toBe('promotion');
      expect(verifyResponse.body.priority).toBe(5);
      expect(verifyResponse.body.targetAudience).toBe('new');
      expect(verifyResponse.body.isActive).toBe(false);
      expect(verifyResponse.body.metadata.tags).toEqual(['updated', 'promotion']);
      expect(verifyResponse.body.metadata.lastModifiedBy).toBe(testAdmin._id.toString());

      // Step 4: Verify the offer appears in the offers list with updated data
      const listResponse = await request(app)
        .get('/api/admin/offers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const updatedOfferInList = listResponse.body.find(offer => offer._id === testOffer._id.toString());
      expect(updatedOfferInList).toBeDefined();
      expect(updatedOfferInList.text).toBe('Updated Offer Text');
      expect(updatedOfferInList.title).toBe('Updated Title');
      expect(updatedOfferInList.type).toBe('promotion');
      expect(updatedOfferInList.priority).toBe(5);
      expect(updatedOfferInList.isActive).toBe(false);
    });

    test('should handle partial updates correctly', async () => {
      // Update only specific fields
      const partialUpdateData = {
        text: 'Partially Updated Text',
        priority: 10
      };

      const updateResponse = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(partialUpdateData)
        .expect(200);

      expect(updateResponse.body.offer.text).toBe('Partially Updated Text');
      expect(updateResponse.body.offer.priority).toBe(10);
      // Other fields should remain unchanged
      expect(updateResponse.body.offer.title).toBe('Original Title');
      expect(updateResponse.body.offer.description).toBe('Original Description');
      expect(updateResponse.body.offer.type).toBe('announcement');
      expect(updateResponse.body.offer.targetAudience).toBe('all');
      expect(updateResponse.body.offer.isActive).toBe(true);
    });

    test('should maintain data integrity during updates', async () => {
      // Create multiple offers to test data integrity
      const offer2 = new Offer({
        text: 'Second Offer',
        title: 'Second Title',
        type: 'news',
        priority: 2,
        targetAudience: 'returning',
        isActive: true,
        metadata: {
          createdBy: testAdmin._id,
          tags: ['second']
        }
      });
      await offer2.save();

      // Update first offer
      const updateData = {
        text: 'Updated First Offer',
        priority: 15
      };

      await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      // Verify second offer is unchanged
      const secondOfferResponse = await request(app)
        .get(`/api/admin/offers/${offer2._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(secondOfferResponse.body.text).toBe('Second Offer');
      expect(secondOfferResponse.body.title).toBe('Second Title');
      expect(secondOfferResponse.body.type).toBe('news');
      expect(secondOfferResponse.body.priority).toBe(2);
      expect(secondOfferResponse.body.targetAudience).toBe('returning');
      expect(secondOfferResponse.body.isActive).toBe(true);
    });

    test('should handle concurrent updates correctly', async () => {
      // Simulate concurrent updates
      const update1 = {
        text: 'Update 1',
        priority: 5
      };

      const update2 = {
        text: 'Update 2',
        priority: 10
      };

      // Execute updates concurrently
      const [response1, response2] = await Promise.all([
        request(app)
          .put(`/api/admin/offers/${testOffer._id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(update1),
        request(app)
          .put(`/api/admin/offers/${testOffer._id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(update2)
      ]);

      // Both should succeed (last write wins)
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Verify final state
      const finalResponse = await request(app)
        .get(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // The final state should reflect one of the updates
      expect(['Update 1', 'Update 2']).toContain(finalResponse.body.text);
      expect([5, 10]).toContain(finalResponse.body.priority);
    });

    test('should handle validation errors in workflow', async () => {
      // Try to update with invalid data
      const invalidUpdateData = {
        text: 'AB', // Too short
        title: 'A'.repeat(101), // Too long
        type: 'invalid-type',
        priority: -1
      };

      const updateResponse = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidUpdateData)
        .expect(400);

      expect(updateResponse.body.message).toBe('Validation failed');
      expect(updateResponse.body.errors).toHaveLength(4);

      // Verify original offer is unchanged
      const verifyResponse = await request(app)
        .get(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(verifyResponse.body.text).toBe('Original Offer Text');
      expect(verifyResponse.body.title).toBe('Original Title');
      expect(verifyResponse.body.type).toBe('announcement');
      expect(verifyResponse.body.priority).toBe(1);
    });

    test('should handle authentication errors in workflow', async () => {
      // Try to update without token
      const updateData = { text: 'Unauthorized Update' };

      await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .send(updateData)
        .expect(401);

      // Try to update with invalid token
      await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', 'Bearer invalid-token')
        .send(updateData)
        .expect(401);

      // Verify offer is unchanged
      const verifyResponse = await request(app)
        .get(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(verifyResponse.body.text).toBe('Original Offer Text');
    });

    test('should handle non-existent offer updates', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const updateData = { text: 'Update Non-existent' };

      const updateResponse = await request(app)
        .put(`/api/admin/offers/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(404);

      expect(updateResponse.body.message).toBe('Offer not found');
    });

    test('should update offer metadata correctly', async () => {
      const updateData = {
        text: 'Updated Text',
        tags: ['new', 'updated', 'test']
      };

      const updateResponse = await request(app)
        .put(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(updateResponse.body.offer.metadata.tags).toEqual(['new', 'updated', 'test']);
      expect(updateResponse.body.offer.metadata.lastModifiedBy).toBe(testAdmin._id.toString());
      expect(updateResponse.body.offer.metadata.createdBy).toBe(testAdmin._id.toString());

      // Verify metadata is persisted
      const verifyResponse = await request(app)
        .get(`/api/admin/offers/${testOffer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(verifyResponse.body.metadata.tags).toEqual(['new', 'updated', 'test']);
      expect(verifyResponse.body.metadata.lastModifiedBy).toBe(testAdmin._id.toString());
    });
  });
});
