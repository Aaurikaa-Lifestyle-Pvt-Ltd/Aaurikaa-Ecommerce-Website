const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Import the service and models
const { 
  updateSellerApproval, 
  bulkApproveSellers, 
  getSellerApprovalHistory, 
  getSellersByStatus 
} = require('../../services/sellerApprovalService');
const Seller = require('../../models/Seller');

// Mock notification service
jest.mock('../../utils/notificationService', () => ({
  notifySellerStatusUpdate: jest.fn().mockResolvedValue({ success: true })
}));

describe('Seller Approval Service', () => {
  let mongoServer;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Connect to in-memory database
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clean up collections before each test
    await Seller.deleteMany({});
  });

  describe('updateSellerApproval', () => {
    let testSeller;

    beforeEach(async () => {
      // Create a test seller
      testSeller = new Seller({
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        email: 'john@example.com',
        phone: '1234567890',
        shopName: 'John\'s Shop',
        shopUrl: 'https://johnshop.com',
        password: 'hashedpassword123',
        isApproved: false,
        status: 'pending'
      });
      await testSeller.save();
    });

    it('should approve a seller successfully', async () => {
      const adminId = new mongoose.Types.ObjectId();
      const result = await updateSellerApproval(testSeller._id, true, null, adminId);

      expect(result.success).toBe(true);
      expect(result.data.message).toContain('approved successfully');
      expect(result.data.seller.isApproved).toBe(true);
      expect(result.data.seller.status).toBe('approved');

      // Verify seller was updated in database
      const updatedSeller = await Seller.findById(testSeller._id);
      expect(updatedSeller.isApproved).toBe(true);
      expect(updatedSeller.approvalHistory).toHaveLength(1);
      expect(updatedSeller.approvalHistory[0].status).toBe('approved');
      expect(updatedSeller.approvalHistory[0].updatedBy).toEqual(adminId);
    });

    it('should reject a seller with reason', async () => {
      const reason = 'Incomplete documentation';
      const adminId = new mongoose.Types.ObjectId();
      const result = await updateSellerApproval(testSeller._id, false, reason, adminId);

      expect(result.success).toBe(true);
      expect(result.data.message).toContain('rejected successfully');
      expect(result.data.seller.isApproved).toBe(false);
      expect(result.data.seller.status).toBe('rejected');

      // Verify seller was updated in database
      const updatedSeller = await Seller.findById(testSeller._id);
      expect(updatedSeller.isApproved).toBe(false);
      expect(updatedSeller.approvalHistory).toHaveLength(1);
      expect(updatedSeller.approvalHistory[0].status).toBe('rejected');
      expect(updatedSeller.approvalHistory[0].reason).toBe(reason);
    });

    it('should return error for invalid seller ID', async () => {
      const adminId = new mongoose.Types.ObjectId();
      const result = await updateSellerApproval('invalid-id', true, null, adminId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid seller ID format');
    });

    it('should return error for non-existent seller', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const adminId = new mongoose.Types.ObjectId();
      const result = await updateSellerApproval(nonExistentId, true, null, adminId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Seller not found');
    });

    it('should add multiple approval history entries', async () => {
      const admin1Id = new mongoose.Types.ObjectId();
      const admin2Id = new mongoose.Types.ObjectId();
      
      // First approval
      await updateSellerApproval(testSeller._id, true, null, admin1Id);
      
      // Then rejection
      const result = await updateSellerApproval(testSeller._id, false, 'Quality issues', admin2Id);

      expect(result.success).toBe(true);

      const updatedSeller = await Seller.findById(testSeller._id);
      expect(updatedSeller.approvalHistory).toHaveLength(2);
      expect(updatedSeller.approvalHistory[0].status).toBe('approved');
      expect(updatedSeller.approvalHistory[1].status).toBe('rejected');
      expect(updatedSeller.approvalHistory[1].reason).toBe('Quality issues');
    });
  });

  describe('bulkApproveSellers', () => {
    let testSellers;

    beforeEach(async () => {
      // Create multiple test sellers
      testSellers = await Seller.insertMany([
        {
          firstName: 'John',
          lastName: 'Doe',
          username: 'johndoe',
          email: 'john@example.com',
          phone: '1234567890',
          shopName: 'John\'s Shop',
          shopUrl: 'https://johnshop.com',
          password: 'hashedpassword123',
          isApproved: false,
          status: 'pending'
        },
        {
          firstName: 'Jane',
          lastName: 'Smith',
          username: 'janesmith',
          email: 'jane@example.com',
          phone: '1234567891',
          shopName: 'Jane\'s Shop',
          shopUrl: 'https://janeshop.com',
          password: 'hashedpassword123',
          isApproved: false,
          status: 'pending'
        }
      ]);
    });

    it('should bulk approve multiple sellers', async () => {
      const sellerIds = testSellers.map(seller => seller._id);
      const adminId = new mongoose.Types.ObjectId();
      const result = await bulkApproveSellers(sellerIds, adminId);

      expect(result.success).toBe(true);
      expect(result.data.modifiedCount).toBe(2);
      expect(result.data.message).toContain('2 sellers approved successfully');

      // Verify all sellers were updated
      const updatedSellers = await Seller.find({ _id: { $in: sellerIds } });
      updatedSellers.forEach(seller => {
        expect(seller.isApproved).toBe(true);
        expect(seller.approvalHistory).toHaveLength(1);
        expect(seller.approvalHistory[0].status).toBe('approved');
      });
    });

    it('should handle empty array', async () => {
      const adminId = new mongoose.Types.ObjectId();
      const result = await bulkApproveSellers([], adminId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Array of seller IDs is required');
    });

    it('should handle invalid seller IDs', async () => {
      const adminId = new mongoose.Types.ObjectId();
      const result = await bulkApproveSellers(['invalid-id', 'another-invalid'], adminId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('One or more invalid seller IDs provided');
    });

    it('should handle mixed valid and invalid IDs', async () => {
      const mixedIds = [testSellers[0]._id, 'invalid-id'];
      const adminId = new mongoose.Types.ObjectId();
      const result = await bulkApproveSellers(mixedIds, adminId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('One or more invalid seller IDs provided');
    });
  });

  describe('getSellerApprovalHistory', () => {
    let testSeller;

    beforeEach(async () => {
      testSeller = new Seller({
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        email: 'john@example.com',
        phone: '1234567890',
        shopName: 'John\'s Shop',
        shopUrl: 'https://johnshop.com',
        password: 'hashedpassword123',
        approvalHistory: [
          {
            status: 'approved',
            updatedBy: new mongoose.Types.ObjectId(),
            updatedAt: new Date('2023-01-01')
          },
          {
            status: 'rejected',
            reason: 'Documentation issues',
            updatedBy: new mongoose.Types.ObjectId(),
            updatedAt: new Date('2023-01-02')
          }
        ]
      });
      await testSeller.save();
    });

    it('should get seller approval history', async () => {
      const result = await getSellerApprovalHistory(testSeller._id);

      expect(result.success).toBe(true);
      expect(result.data.seller._id).toEqual(testSeller._id);
      expect(result.data.seller.firstName).toBe('John');
      expect(result.data.approvalHistory).toHaveLength(2);
      expect(result.data.approvalHistory[0].status).toBe('approved');
      expect(result.data.approvalHistory[1].status).toBe('rejected');
      expect(result.data.approvalHistory[1].reason).toBe('Documentation issues');
    });

    it('should return error for non-existent seller', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const result = await getSellerApprovalHistory(nonExistentId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Seller not found');
    });
  });

  describe('getSellersByStatus', () => {
    beforeEach(async () => {
      // Create sellers with different statuses
      await Seller.insertMany([
        {
          firstName: 'John',
          lastName: 'Doe',
          username: 'johndoe',
          email: 'john@example.com',
          phone: '1234567890',
          shopName: 'John\'s Shop',
          shopUrl: 'https://johnshop.com',
          password: 'hashedpassword123',
          isApproved: true
        },
        {
          firstName: 'Jane',
          lastName: 'Smith',
          username: 'janesmith',
          email: 'jane@example.com',
          phone: '1234567891',
          shopName: 'Jane\'s Shop',
          shopUrl: 'https://janeshop.com',
          password: 'hashedpassword123',
          isApproved: false
        },
        {
          firstName: 'Bob',
          lastName: 'Johnson',
          username: 'bobjohnson',
          email: 'bob@example.com',
          phone: '1234567892',
          shopName: 'Bob\'s Shop',
          shopUrl: 'https://bobshop.com',
          password: 'hashedpassword123',
          isApproved: null
          // Explicitly null for pending status
        }
      ]);
    });

    it('should get approved sellers', async () => {
      const result = await getSellersByStatus('approved');

      expect(result.success).toBe(true);
      expect(result.data.sellers).toHaveLength(1);
      expect(result.data.sellers[0].firstName).toBe('John');
      expect(result.data.sellers[0].isApproved).toBe(true);
      expect(result.data.pagination.total).toBe(1);
    });

    it('should get rejected sellers', async () => {
      const result = await getSellersByStatus('rejected');

      expect(result.success).toBe(true);
      expect(result.data.sellers).toHaveLength(1);
      expect(result.data.sellers[0].firstName).toBe('Jane');
      expect(result.data.sellers[0].isApproved).toBe(false);
    });

    it('should get pending sellers', async () => {
      const result = await getSellersByStatus('pending');

      expect(result.success).toBe(true);
      expect(result.data.sellers).toHaveLength(1);
      expect(result.data.sellers[0].firstName).toBe('Bob');
      expect(result.data.sellers[0].isApproved).toBeNull();
    });

    it('should handle pagination options', async () => {
      const result = await getSellersByStatus('approved', { limit: 1, skip: 0 });

      expect(result.success).toBe(true);
      expect(result.data.sellers).toHaveLength(1);
      expect(result.data.pagination.limit).toBe(1);
      expect(result.data.pagination.skip).toBe(0);
    });
  });
});
