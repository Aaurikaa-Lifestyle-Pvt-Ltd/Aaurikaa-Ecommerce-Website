// backend/tests/routes/blogCategoryValidationRoutes.test.js
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const blogCategoryRoutes = require('../../routes/blogCategoryRoutes');
const BlogCategory = require('../../models/BlogCategory');

const app = express();
app.use(express.json());
app.use('/api/blog-categories', blogCategoryRoutes);

describe('Blog Category Routes with Validation', () => {
  afterAll(async () => {
    await BlogCategory.deleteMany({});
    await mongoose.connection.close();
  });

  describe('Blog category creation validation', () => {
    test('should reject category creation without name', async () => {
      const response = await request(app)
        .post('/api/blog-categories/add')
        .send({
          description: 'Test category description'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('Missing required fields: name');
    });

    test('should reject category creation with invalid name format', async () => {
      const response = await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: 'Category@#$%',
          description: 'Test category description'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid name format');
    });

    test('should reject category creation with name too short', async () => {
      const response = await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: 'A',
          description: 'Test category description'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid name format');
    });

    test('should reject category creation with name too long', async () => {
      const longName = 'a'.repeat(51);
      const response = await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: longName,
          description: 'Test category description'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid name format');
    });

    test('should reject category creation with description too long', async () => {
      const longDescription = 'a'.repeat(501);
      const response = await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: 'Valid Category',
          description: longDescription
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid description format');
    });

    test('should reject category creation with invalid slug', async () => {
      const response = await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: 'Valid Category',
          description: 'Test category description',
          slug: 'Invalid_Slug@#$'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid slug format');
    });
  });

  describe('Valid blog category operations', () => {
    test('should accept valid category creation', async () => {
      const response = await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: 'Valid Category',
          description: 'This is a valid category description'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('✅ Category added successfully');
      expect(response.body.category.name).toBe('Valid Category');
      expect(response.body.category.slug).toBe('valid-category');
    });

    test('should accept minimal valid category creation', async () => {
      const response = await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: 'Minimal Category'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('✅ Category added successfully');
      expect(response.body.category.name).toBe('Minimal Category');
    });

    test('should accept category with custom slug', async () => {
      const response = await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: 'Custom Slug Category',
          description: 'Category with custom slug',
          slug: 'custom-slug-123'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('✅ Category added successfully');
      expect(response.body.category.slug).toBe('custom-slug-123');
    });

    test('should accept category with special characters in name', async () => {
      const response = await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: 'Tech & Innovation',
          description: 'Technology and innovation category'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('✅ Category added successfully');
      expect(response.body.category.slug).toBe('tech-innovation');
    });
  });

  describe('Duplicate category handling', () => {
    test('should reject duplicate category name', async () => {
      // Create first category
      await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: 'Duplicate Test',
          description: 'First category'
        });

      // Try to create second category with same name
      const response = await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: 'Duplicate Test',
          description: 'Second category'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('❌ Category with this name already exists');
    });

    test('should handle case-insensitive duplicate detection', async () => {
      // Create first category
      await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: 'Case Test',
          description: 'First category'
        });

      // Try to create second category with different case
      const response = await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: 'CASE TEST',
          description: 'Second category'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('❌ Category with this name already exists');
    });
  });

  describe('Input sanitization', () => {
    test('should sanitize category creation input', async () => {
      const response = await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: '  Sanitized Category  ',
          description: '  This is a sanitized description  '
        });

      expect(response.status).toBe(200);
      expect(response.body.category.name).toBe('Sanitized Category');
      expect(response.body.category.description).toBe('This is a sanitized description');
    });
  });

  describe('Category retrieval', () => {
    test('should retrieve all categories', async () => {
      const response = await request(app)
        .get('/api/blog-categories/all');

      expect(response.status).toBe(200);
      expect(response.body.categories).toBeDefined();
      expect(Array.isArray(response.body.categories)).toBe(true);
    });
  });

  describe('Category deletion', () => {
    test('should delete category successfully', async () => {
      // Create a category to delete
      const createResponse = await request(app)
        .post('/api/blog-categories/add')
        .send({
          name: 'To Be Deleted',
          description: 'This category will be deleted'
        });

      const categoryId = createResponse.body.category._id;

      // Delete the category
      const deleteResponse = await request(app)
        .delete(`/api/blog-categories/delete/${categoryId}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.message).toBe('Category deleted');
    });

    test('should handle deletion of non-existent category', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/blog-categories/delete/${fakeId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Category deleted');
    });
  });
});
