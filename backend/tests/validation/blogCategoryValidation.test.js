// backend/tests/validation/blogCategoryValidation.test.js
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { validateBlogCategory } = require('../../middleware/validation');
const BlogCategory = require('../../models/BlogCategory');

const app = express();
app.use(express.json());

// Test route for blog category validation
app.post('/test/blog-category', validateBlogCategory, (req, res) => {
  res.json({ message: 'Validation passed', data: req.body });
});

describe('Blog Category Validation', () => {
  afterAll(async () => {
    await BlogCategory.deleteMany({});
    await mongoose.connection.close();
  });

  describe('Required fields validation', () => {
    test('should reject request without name', async () => {
      const response = await request(app)
        .post('/test/blog-category')
        .send({
          description: 'Test category description'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('Missing required fields: name');
    });

    test('should reject empty name', async () => {
      const response = await request(app)
        .post('/test/blog-category')
        .send({
          name: '',
          description: 'Test category description'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Missing required fields: name');
    });
  });

  describe('Field format validation', () => {
    test('should reject name that is too short', async () => {
      const response = await request(app)
        .post('/test/blog-category')
        .send({
          name: 'A',
          description: 'Test category description'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid name format');
    });

    test('should reject name that is too long', async () => {
      const longName = 'a'.repeat(51);
      const response = await request(app)
        .post('/test/blog-category')
        .send({
          name: longName,
          description: 'Test category description'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid name format');
    });

    test('should reject name with invalid characters', async () => {
      const response = await request(app)
        .post('/test/blog-category')
        .send({
          name: 'Category@#$%',
          description: 'Test category description'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid name format');
    });

    test('should reject description that is too long', async () => {
      const longDescription = 'a'.repeat(501);
      const response = await request(app)
        .post('/test/blog-category')
        .send({
          name: 'Valid Category',
          description: longDescription
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid description format');
    });

    test('should reject invalid slug format', async () => {
      const response = await request(app)
        .post('/test/blog-category')
        .send({
          name: 'Valid Category',
          description: 'Test category description',
          slug: 'Invalid_Slug@#$'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid slug format');
    });

    test('should reject slug that is too short', async () => {
      const response = await request(app)
        .post('/test/blog-category')
        .send({
          name: 'Valid Category',
          description: 'Test category description',
          slug: 'a'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid slug format');
    });

    test('should reject slug that is too long', async () => {
      const longSlug = 'a'.repeat(51);
      const response = await request(app)
        .post('/test/blog-category')
        .send({
          name: 'Valid Category',
          description: 'Test category description',
          slug: longSlug
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid slug format');
    });
  });

  describe('Valid data acceptance', () => {
    test('should accept valid category data', async () => {
      const response = await request(app)
        .post('/test/blog-category')
        .send({
          name: 'Valid Category',
          description: 'This is a valid category description',
          slug: 'valid-category'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Validation passed');
    });

    test('should accept minimal valid category data', async () => {
      const response = await request(app)
        .post('/test/blog-category')
        .send({
          name: 'Minimal Category'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Validation passed');
    });

    test('should accept category with special characters in name', async () => {
      const response = await request(app)
        .post('/test/blog-category')
        .send({
          name: 'Tech & Innovation',
          description: 'Technology and innovation category'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Validation passed');
    });

    test('should accept category with numbers in name', async () => {
      const response = await request(app)
        .post('/test/blog-category')
        .send({
          name: 'Category 2024',
          description: 'Category for year 2024'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Validation passed');
    });
  });

  describe('Input sanitization', () => {
    test('should sanitize input data', async () => {
      const response = await request(app)
        .post('/test/blog-category')
        .send({
          name: '  Sanitized Category  ',
          description: '  This is a sanitized description  '
        });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Sanitized Category');
      expect(response.body.data.description).toBe('This is a sanitized description');
    });
  });
});
