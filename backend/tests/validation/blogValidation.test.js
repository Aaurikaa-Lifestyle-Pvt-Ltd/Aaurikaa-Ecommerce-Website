// backend/tests/validation/blogValidation.test.js
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { validateBlog } = require('../../middleware/validation');
const BlogCategory = require('../../models/BlogCategory');

const app = express();
app.use(express.json());

// Test route for blog validation
app.post('/test/blog', validateBlog, (req, res) => {
  res.json({ message: 'Validation passed', data: req.body });
});

describe('Blog Validation', () => {
  let testCategory;

  beforeAll(async () => {
    // Create test category
    testCategory = new BlogCategory({
      name: 'Test Category',
      description: 'Test category for validation'
    });
    await testCategory.save();
  });

  afterAll(async () => {
    await BlogCategory.deleteMany({});
    await mongoose.connection.close();
  });

  describe('Required fields validation', () => {
    test('should reject request without title', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          description: 'Test description',
          author: 'Test Author',
          category: testCategory._id
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('Missing required fields: title');
    });

    test('should reject request without description', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: 'Test Title',
          author: 'Test Author',
          category: testCategory._id
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Missing required fields: description');
    });

    test('should reject request without author', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: 'Test Title',
          description: 'Test description',
          category: testCategory._id
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Missing required fields: author');
    });

    test('should reject request without category', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: 'Test Title',
          description: 'Test description',
          author: 'Test Author'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Missing required fields: category');
    });
  });

  describe('Field format validation', () => {
    test('should reject invalid title format', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: 'T@#$%^&*()',
          description: 'Test description',
          author: 'Test Author',
          category: testCategory._id
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid title format');
    });

    test('should reject title that is too short', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: '',
          description: 'Test description',
          author: 'Test Author',
          category: testCategory._id
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid title format');
    });

    test('should reject title that is too long', async () => {
      const longTitle = 'a'.repeat(201);
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: longTitle,
          description: 'Test description',
          author: 'Test Author',
          category: testCategory._id
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid title format');
    });

    test('should reject description that is too short', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: 'Test Title',
          description: 'Short',
          author: 'Test Author',
          category: testCategory._id
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid description format');
    });

    test('should reject invalid author format', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: 'Test Title',
          description: 'Test description',
          author: 'Author@#$%',
          category: testCategory._id
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid author format');
    });

    test('should reject invalid category ID', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: 'Test Title',
          description: 'Test description',
          author: 'Test Author',
          category: 'invalid-id'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid category format');
    });

    test('should reject invalid status', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: 'Test Title',
          description: 'Test description',
          author: 'Test Author',
          category: testCategory._id,
          status: 'invalid-status'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid status format');
    });

    test('should reject invalid canonical URL', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: 'Test Title',
          description: 'Test description',
          author: 'Test Author',
          category: testCategory._id,
          canonicalUrl: 'not-a-url'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid canonicalUrl format');
    });

    test('should reject invalid date', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: 'Test Title',
          description: 'Test description',
          author: 'Test Author',
          category: testCategory._id,
          date: 'invalid-date'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid date format');
    });
  });

  describe('Valid data acceptance', () => {
    test('should accept valid blog data', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: 'Valid Blog Title',
          description: 'This is a valid blog description with sufficient length',
          author: 'Valid Author',
          category: testCategory._id,
          status: 'published',
          tags: 'tag1, tag2, tag3',
          metaDescription: 'Valid meta description',
          canonicalUrl: 'https://example.com/blog/valid-blog',
          ogTitle: 'Valid OG Title',
          ogDescription: 'Valid OG description',
          twitterTitle: 'Valid Twitter Title',
          twitterDescription: 'Valid Twitter description'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Validation passed');
    });

    test('should accept minimal valid blog data', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: 'Minimal Blog',
          description: 'This is a minimal valid blog description',
          author: 'Minimal Author',
          category: testCategory._id
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Validation passed');
    });

    test('should accept draft status', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: 'Draft Blog',
          description: 'This is a draft blog description',
          author: 'Draft Author',
          category: testCategory._id,
          status: 'draft'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Validation passed');
    });
  });

  describe('Input sanitization', () => {
    test('should sanitize input data', async () => {
      const response = await request(app)
        .post('/test/blog')
        .send({
          title: '  Sanitized Title  ',
          description: '  This is a sanitized description  ',
          author: '  Sanitized Author  ',
          category: testCategory._id
        });

      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe('Sanitized Title');
      expect(response.body.data.description).toBe('This is a sanitized description');
      expect(response.body.data.author).toBe('Sanitized Author');
    });
  });
});
