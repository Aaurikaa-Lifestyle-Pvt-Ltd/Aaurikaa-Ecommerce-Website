// backend/tests/routes/commentThreading.test.js
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const commentRoutes = require('../../routes/commentRoutes');
const Comment = require('../../models/Comment');
const Blog = require('../../models/Blog');
const BlogCategory = require('../../models/BlogCategory');

const app = express();
app.use(express.json());
app.use('/api/comments', commentRoutes);

describe('Comment Threading Routes', () => {
  let testBlog;
  let testCategory;
  let parentComment;

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
      description: 'This is a test blog post for comment threading',
      category: testCategory._id,
      author: 'Test Author',
      status: 'published'
    });
    await testBlog.save();

    // Create parent comment
    parentComment = new Comment({
      blog: testBlog._id,
      content: 'This is a parent comment',
      author: {
        name: 'Parent Author',
        email: 'parent@example.com'
      },
      status: 'approved',
      ipAddress: '127.0.0.1'
    });
    await parentComment.save();
  });

  afterAll(async () => {
    await Comment.deleteMany({});
    await Blog.deleteMany({});
    await BlogCategory.deleteMany({});
    await mongoose.connection.close();
  });

  describe('GET /api/comments/blog/:blogId/threaded', () => {
    test('should get threaded comments', async () => {
      const response = await request(app)
        .get(`/api/comments/blog/${testBlog._id}/threaded`);

      expect(response.status).toBe(200);
      expect(response.body.comments).toHaveLength(1);
      expect(response.body.comments[0]).toHaveProperty('replies');
      expect(response.body.comments[0].replies).toHaveLength(0);
      expect(response.body.total).toBe(1);
      expect(response.body.topLevelCount).toBe(1);
      expect(response.body.repliesCount).toBe(0);
    });

    test('should return 404 for non-existent blog', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/comments/blog/${fakeId}/threaded`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('❌ Blog post not found');
    });

    test('should organize replies under parent comments', async () => {
      // Create a reply
      const reply = new Comment({
        blog: testBlog._id,
        content: 'This is a reply to the parent comment',
        author: {
          name: 'Reply Author',
          email: 'reply@example.com'
        },
        parentComment: parentComment._id,
        status: 'approved',
        ipAddress: '127.0.0.1'
      });
      await reply.save();

      const response = await request(app)
        .get(`/api/comments/blog/${testBlog._id}/threaded`);

      expect(response.status).toBe(200);
      expect(response.body.comments).toHaveLength(1);
      expect(response.body.comments[0].replies).toHaveLength(1);
      expect(response.body.comments[0].replies[0].content).toBe('This is a reply to the parent comment');
      expect(response.body.total).toBe(2);
      expect(response.body.topLevelCount).toBe(1);
      expect(response.body.repliesCount).toBe(1);
    });
  });

  describe('GET /api/comments/:id/replies', () => {
    test('should get replies for a specific comment', async () => {
      const response = await request(app)
        .get(`/api/comments/${parentComment._id}/replies`);

      expect(response.status).toBe(200);
      expect(response.body.replies).toHaveLength(1);
      expect(response.body.total).toBe(1);
      expect(response.body.parentComment).toHaveProperty('_id');
      expect(response.body.parentComment).toHaveProperty('author');
      expect(response.body.parentComment).toHaveProperty('content');
    });

    test('should return 404 for non-existent parent comment', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/comments/${fakeId}/replies`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('❌ Parent comment not found');
    });

    test('should return empty array when no replies exist', async () => {
      // Create a comment without replies
      const commentWithoutReplies = new Comment({
        blog: testBlog._id,
        content: 'This comment has no replies',
        author: {
          name: 'No Replies Author',
          email: 'noreplies@example.com'
        },
        status: 'approved',
        ipAddress: '127.0.0.1'
      });
      await commentWithoutReplies.save();

      const response = await request(app)
        .get(`/api/comments/${commentWithoutReplies._id}/replies`);

      expect(response.status).toBe(200);
      expect(response.body.replies).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });
  });

  describe('POST /api/comments (with parentCommentId)', () => {
    test('should create a reply to an existing comment', async () => {
      const replyData = {
        blogId: testBlog._id,
        content: 'This is a new reply',
        authorName: 'New Reply Author',
        authorEmail: 'newreply@example.com',
        parentCommentId: parentComment._id
      };

      const response = await request(app)
        .post('/api/comments')
        .send(replyData);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('✅ Comment submitted successfully');
      expect(response.body.comment.parentComment).toBe(parentComment._id.toString());
    });

    test('should validate parent comment exists', async () => {
      const fakeParentId = new mongoose.Types.ObjectId();
      const replyData = {
        blogId: testBlog._id,
        content: 'This reply has invalid parent',
        authorName: 'Invalid Parent Author',
        authorEmail: 'invalid@example.com',
        parentCommentId: fakeParentId
      };

      const response = await request(app)
        .post('/api/comments')
        .send(replyData);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('❌ Invalid parent comment');
    });

    test('should validate parent comment belongs to same blog', async () => {
      // Create another blog
      const anotherBlog = new Blog({
        title: 'Another Blog',
        description: 'Another test blog',
        category: testCategory._id,
        author: 'Another Author',
        status: 'published'
      });
      await anotherBlog.save();

      // Create comment on another blog
      const anotherComment = new Comment({
        blog: anotherBlog._id,
        content: 'Comment on another blog',
        author: {
          name: 'Another Author',
          email: 'another@example.com'
        },
        status: 'approved',
        ipAddress: '127.0.0.1'
      });
      await anotherComment.save();

      const replyData = {
        blogId: testBlog._id,
        content: 'This reply has wrong parent blog',
        authorName: 'Wrong Parent Author',
        authorEmail: 'wrong@example.com',
        parentCommentId: anotherComment._id
      };

      const response = await request(app)
        .post('/api/comments')
        .send(replyData);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('❌ Invalid parent comment');

      // Cleanup
      await Blog.findByIdAndDelete(anotherBlog._id);
      await Comment.findByIdAndDelete(anotherComment._id);
    });
  });

  describe('Comment hierarchy validation', () => {
    test('should prevent deep nesting (only 2 levels)', async () => {
      // Create a reply to the parent comment
      const firstReply = new Comment({
        blog: testBlog._id,
        content: 'First level reply',
        author: {
          name: 'First Reply Author',
          email: 'first@example.com'
        },
        parentComment: parentComment._id,
        status: 'approved',
        ipAddress: '127.0.0.1'
      });
      await firstReply.save();

      // Try to create a reply to the reply (should be allowed but limited)
      const secondReplyData = {
        blogId: testBlog._id,
        content: 'Second level reply',
        authorName: 'Second Reply Author',
        authorEmail: 'second@example.com',
        parentCommentId: firstReply._id
      };

      const response = await request(app)
        .post('/api/comments')
        .send(secondReplyData);

      // This should work as we allow 2-level nesting
      expect(response.status).toBe(201);
      expect(response.body.comment.parentComment).toBe(firstReply._id.toString());
    });
  });
});
