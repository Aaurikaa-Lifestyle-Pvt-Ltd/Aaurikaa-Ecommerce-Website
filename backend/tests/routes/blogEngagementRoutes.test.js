// backend/tests/routes/blogEngagementRoutes.test.js
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const blogRoutes = require('../../routes/blogRoutes');
const Blog = require('../../models/Blog');
const BlogCategory = require('../../models/BlogCategory');

const app = express();
app.use(express.json());
app.use('/api/blogs', blogRoutes);

describe('Blog Engagement Routes', () => {
  let testBlog;
  let testCategory;

  beforeAll(async () => {
    // Create test category
    testCategory = new BlogCategory({
      name: 'Test Category',
      slug: 'test-category'
    });
    await testCategory.save();

    // Create test blog
    testBlog = new Blog({
      title: 'Test Blog Post',
      description: 'This is a test blog post for engagement testing',
      category: testCategory._id,
      author: 'Test Author',
      tags: ['test', 'engagement'],
      status: 'published'
    });
    await testBlog.save();
  });

  afterAll(async () => {
    await Blog.deleteMany({});
    await BlogCategory.deleteMany({});
    await mongoose.connection.close();
  });

  describe('POST /api/blogs/:id/like', () => {
    test('should like a blog post', async () => {
      const response = await request(app)
        .post(`/api/blogs/${testBlog._id}/like`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('✅ Blog liked');
      expect(response.body.likes).toBe(1);
      expect(response.body.dislikes).toBe(0);
    });

    test('should return 404 for non-existent blog', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/blogs/${fakeId}/like`)
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('❌ Blog not found');
    });

    test('should not allow liking unpublished blog', async () => {
      const draftBlog = new Blog({
        title: 'Draft Blog',
        description: 'This is a draft blog',
        category: testCategory._id,
        author: 'Test Author',
        status: 'draft'
      });
      await draftBlog.save();

      const response = await request(app)
        .post(`/api/blogs/${draftBlog._id}/like`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('❌ Cannot like unpublished blog');

      await Blog.findByIdAndDelete(draftBlog._id);
    });
  });

  describe('POST /api/blogs/:id/dislike', () => {
    test('should dislike a blog post', async () => {
      const response = await request(app)
        .post(`/api/blogs/${testBlog._id}/dislike`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('✅ Blog disliked');
      expect(response.body.dislikes).toBe(1);
    });

    test('should return 404 for non-existent blog', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/blogs/${fakeId}/dislike`)
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('❌ Blog not found');
    });
  });

  describe('POST /api/blogs/:id/view', () => {
    test('should record a view', async () => {
      const response = await request(app)
        .post(`/api/blogs/${testBlog._id}/view`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('✅ View recorded');
      expect(response.body.views).toBe(1);
    });

    test('should return 404 for non-existent blog', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/blogs/${fakeId}/view`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('❌ Blog not found');
    });
  });

  describe('POST /api/blogs/:id/share', () => {
    test('should record a share', async () => {
      const response = await request(app)
        .post(`/api/blogs/${testBlog._id}/share`)
        .send({ platform: 'facebook' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('✅ Share recorded');
      expect(response.body.shares).toBe(1);
      expect(response.body.platform).toBe('facebook');
    });

    test('should record share without platform', async () => {
      const response = await request(app)
        .post(`/api/blogs/${testBlog._id}/share`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('✅ Share recorded');
      expect(response.body.shares).toBe(2);
      expect(response.body.platform).toBe('unknown');
    });

    test('should return 404 for non-existent blog', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/blogs/${fakeId}/share`)
        .send({ platform: 'twitter' });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('❌ Blog not found');
    });
  });

  describe('GET /api/blogs/engagement/most-liked', () => {
    beforeEach(async () => {
      // Create additional blogs with different like counts
      const popularBlog = new Blog({
        title: 'Popular Blog',
        description: 'This blog is very popular',
        category: testCategory._id,
        author: 'Popular Author',
        status: 'published',
        likes: 100
      });
      await popularBlog.save();
    });

    test('should get most liked blogs', async () => {
      const response = await request(app)
        .get('/api/blogs/engagement/most-liked?limit=5');

      expect(response.status).toBe(200);
      expect(response.body.blogs).toHaveLength(2);
      expect(response.body.blogs[0].likes).toBeGreaterThanOrEqual(response.body.blogs[1].likes);
    });

    test('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/api/blogs/engagement/most-liked?limit=1');

      expect(response.status).toBe(200);
      expect(response.body.blogs).toHaveLength(1);
    });
  });

  describe('GET /api/blogs/engagement/most-viewed', () => {
    beforeEach(async () => {
      // Create additional blogs with different view counts
      const viewedBlog = new Blog({
        title: 'Viewed Blog',
        description: 'This blog has many views',
        category: testCategory._id,
        author: 'Viewed Author',
        status: 'published',
        views: 500
      });
      await viewedBlog.save();
    });

    test('should get most viewed blogs', async () => {
      const response = await request(app)
        .get('/api/blogs/engagement/most-viewed?limit=5');

      expect(response.status).toBe(200);
      expect(response.body.blogs).toHaveLength(3);
      expect(response.body.blogs[0].views).toBeGreaterThanOrEqual(response.body.blogs[1].views);
    });
  });

  describe('GET /api/blogs/engagement/most-shared', () => {
    beforeEach(async () => {
      // Create additional blogs with different share counts
      const sharedBlog = new Blog({
        title: 'Shared Blog',
        description: 'This blog is shared a lot',
        category: testCategory._id,
        author: 'Shared Author',
        status: 'published',
        shares: 50
      });
      await sharedBlog.save();
    });

    test('should get most shared blogs', async () => {
      const response = await request(app)
        .get('/api/blogs/engagement/most-shared?limit=5');

      expect(response.status).toBe(200);
      expect(response.body.blogs).toHaveLength(4);
      expect(response.body.blogs[0].shares).toBeGreaterThanOrEqual(response.body.blogs[1].shares);
    });
  });

  describe('GET /api/blogs/engagement/stats', () => {
    test('should get engagement statistics', async () => {
      const response = await request(app)
        .get('/api/blogs/engagement/stats');

      expect(response.status).toBe(200);
      expect(response.body.stats).toHaveProperty('totalLikes');
      expect(response.body.stats).toHaveProperty('totalDislikes');
      expect(response.body.stats).toHaveProperty('totalViews');
      expect(response.body.stats).toHaveProperty('totalShares');
      expect(response.body.stats).toHaveProperty('averageLikes');
      expect(response.body.stats).toHaveProperty('averageViews');
      expect(response.body.stats).toHaveProperty('blogCount');
      expect(response.body.stats.blogCount).toBeGreaterThan(0);
    });
  });
});
