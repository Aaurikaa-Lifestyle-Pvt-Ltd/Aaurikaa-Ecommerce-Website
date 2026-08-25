// backend/tests/routes/blogValidationRoutes.test.js
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const blogRoutes = require('../../routes/blogRoutes');
const Blog = require('../../models/Blog');
const BlogCategory = require('../../models/BlogCategory');

const app = express();
app.use(express.json());
app.use('/api/blogs', blogRoutes);

describe('Blog Routes with Validation', () => {
  let testCategory;
  let testBlog;

  beforeAll(async () => {
    // Create test category
    testCategory = new BlogCategory({
      name: 'Test Category',
      description: 'Test category for validation'
    });
    await testCategory.save();

    // Create test blog
    testBlog = new Blog({
      title: 'Test Blog',
      description: 'This is a test blog description',
      category: testCategory._id,
      author: 'Test Author',
      status: 'published'
    });
    await testBlog.save();
  });

  afterAll(async () => {
    await Blog.deleteMany({});
    await BlogCategory.deleteMany({});
    await mongoose.connection.close();
  });

  describe('Blog creation validation', () => {
    test('should reject blog creation without required fields', async () => {
      const response = await request(app)
        .post('/api/blogs/admin/add-blog')
        .send({
          title: 'Test Blog'
          // Missing description, author, category
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
    });

    test('should reject blog creation with invalid title', async () => {
      const response = await request(app)
        .post('/api/blogs/admin/add-blog')
        .send({
          title: 'T@#$%^&*()',
          description: 'This is a test blog description',
          author: 'Test Author',
          category: testCategory._id
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid title format');
    });

    test('should reject blog creation with invalid category', async () => {
      const response = await request(app)
        .post('/api/blogs/admin/add-blog')
        .send({
          title: 'Test Blog',
          description: 'This is a test blog description',
          author: 'Test Author',
          category: 'invalid-category-id'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid category format');
    });

    test('should reject blog creation with invalid status', async () => {
      const response = await request(app)
        .post('/api/blogs/admin/add-blog')
        .send({
          title: 'Test Blog',
          description: 'This is a test blog description',
          author: 'Test Author',
          category: testCategory._id,
          status: 'invalid-status'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid status format');
    });

    test('should reject blog creation with invalid canonical URL', async () => {
      const response = await request(app)
        .post('/api/blogs/admin/add-blog')
        .send({
          title: 'Test Blog',
          description: 'This is a test blog description',
          author: 'Test Author',
          category: testCategory._id,
          canonicalUrl: 'not-a-url'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid canonicalUrl format');
    });
  });

  describe('Blog update validation', () => {
    test('should reject blog update with invalid data', async () => {
      const response = await request(app)
        .put(`/api/blogs/admin/edit-blog/${testBlog._id}`)
        .send({
          title: 'T@#$%^&*()',
          description: 'This is a test blog description',
          author: 'Test Author',
          category: testCategory._id
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid title format');
    });

    test('should reject blog update with invalid meta description length', async () => {
      const longMetaDescription = 'a'.repeat(161);
      const response = await request(app)
        .put(`/api/blogs/admin/edit-blog/${testBlog._id}`)
        .send({
          title: 'Test Blog',
          description: 'This is a test blog description',
          author: 'Test Author',
          category: testCategory._id,
          metaDescription: longMetaDescription
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContain('Invalid metaDescription format');
    });
  });

  describe('Valid blog operations', () => {
    test('should accept valid blog creation data', async () => {
      const response = await request(app)
        .post('/api/blogs/admin/add-blog')
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

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('✅ Blog added');
    });

    test('should accept valid blog update data', async () => {
      const response = await request(app)
        .put(`/api/blogs/admin/edit-blog/${testBlog._id}`)
        .send({
          title: 'Updated Blog Title',
          description: 'This is an updated blog description',
          author: 'Updated Author',
          category: testCategory._id,
          status: 'draft',
          metaDescription: 'Updated meta description'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('✅ Blog updated');
    });
  });

  describe('Input sanitization', () => {
    test('should sanitize blog creation input', async () => {
      const response = await request(app)
        .post('/api/blogs/admin/add-blog')
        .send({
          title: '  Sanitized Blog Title  ',
          description: '  This is a sanitized blog description  ',
          author: '  Sanitized Author  ',
          category: testCategory._id
        });

      expect(response.status).toBe(201);
      expect(response.body.blog.title).toBe('Sanitized Blog Title');
      expect(response.body.blog.description).toBe('This is a sanitized blog description');
      expect(response.body.blog.author).toBe('Sanitized Author');
    });
  });
});
