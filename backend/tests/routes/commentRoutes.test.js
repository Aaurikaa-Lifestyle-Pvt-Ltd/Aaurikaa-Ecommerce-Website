// backend/tests/routes/commentRoutes.test.js
const request = require('supertest');
const express = require('express');
const commentRoutes = require('../../routes/commentRoutes');

// Mock the models
jest.mock('../../models/Comment');
jest.mock('../../models/Blog');
jest.mock('../../middleware/verifyAdmin');

const Comment = require('../../models/Comment');
const Blog = require('../../models/Blog');
const verifyAdmin = require('../../middleware/verifyAdmin');

const app = express();
app.use(express.json());
app.use('/api/comments', commentRoutes);

describe('Comment Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/comments/blog/:blogId', () => {
    it('should get comments for a blog', async () => {
      const blogId = 'blog123';
      const mockComments = [
        { _id: 'comment1', content: 'Comment 1', status: 'approved' },
        { _id: 'comment2', content: 'Comment 2', status: 'approved' }
      ];

      Blog.findById.mockResolvedValue({ _id: blogId, title: 'Test Blog' });
      Comment.getByBlog.mockResolvedValue(mockComments);
      Comment.countDocuments.mockResolvedValue(2);

      const response = await request(app)
        .get(`/api/comments/blog/${blogId}`)
        .expect(200);

      expect(response.body.comments).toEqual(mockComments);
      expect(response.body.total).toBe(2);
      expect(Comment.getByBlog).toHaveBeenCalledWith(blogId, expect.any(Object));
    });

    it('should return 404 if blog not found', async () => {
      const blogId = 'nonexistent';
      Blog.findById.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/comments/blog/${blogId}`)
        .expect(404);

      expect(response.body.message).toContain('Blog post not found');
    });

    it('should handle query parameters', async () => {
      const blogId = 'blog123';
      Blog.findById.mockResolvedValue({ _id: blogId });
      Comment.getByBlog.mockResolvedValue([]);
      Comment.countDocuments.mockResolvedValue(0);

      await request(app)
        .get(`/api/comments/blog/${blogId}`)
        .query({
          status: 'pending',
          includeReplies: 'false',
          sortBy: 'createdAt',
          sortOrder: 'desc',
          limit: 10,
          skip: 0
        })
        .expect(200);

      expect(Comment.getByBlog).toHaveBeenCalledWith(blogId, {
        status: 'pending',
        includeReplies: false,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        limit: 10,
        skip: 0
      });
    });
  });

  describe('POST /api/comments', () => {
    it('should create a new comment', async () => {
      const commentData = {
        blogId: 'blog123',
        content: 'Great post!',
        authorName: 'John Doe',
        authorEmail: 'john@example.com',
        authorWebsite: 'https://johndoe.com'
      };

      const mockComment = {
        _id: 'comment123',
        ...commentData,
        status: 'pending',
        createdAt: new Date()
      };

      Blog.findById.mockResolvedValue({ _id: 'blog123', title: 'Test Blog' });
      Comment.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue(mockComment),
        populate: jest.fn().mockResolvedValue(mockComment)
      }));

      const response = await request(app)
        .post('/api/comments')
        .send(commentData)
        .expect(201);

      expect(response.body.message).toContain('Comment submitted successfully');
      expect(response.body.comment).toBeDefined();
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/comments')
        .send({
          content: 'Great post!'
          // Missing blogId, authorName, authorEmail
        })
        .expect(400);

      expect(response.body.message).toContain('Missing required fields');
    });

    it('should return 404 if blog not found', async () => {
      const commentData = {
        blogId: 'nonexistent',
        content: 'Great post!',
        authorName: 'John Doe',
        authorEmail: 'john@example.com'
      };

      Blog.findById.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/comments')
        .send(commentData)
        .expect(404);

      expect(response.body.message).toContain('Blog post not found');
    });

    it('should handle validation errors', async () => {
      const commentData = {
        blogId: 'blog123',
        content: 'Great post!',
        authorName: 'John Doe',
        authorEmail: 'invalid-email'
      };

      Blog.findById.mockResolvedValue({ _id: 'blog123' });
      Comment.mockImplementation(() => ({
        save: jest.fn().mockRejectedValue({
          name: 'ValidationError',
          errors: {
            'author.email': { message: 'Please provide a valid email address' }
          }
        })
      }));

      const response = await request(app)
        .post('/api/comments')
        .send(commentData)
        .expect(400);

      expect(response.body.message).toContain('Validation error');
      expect(response.body.errors).toContain('Please provide a valid email address');
    });
  });

  describe('POST /api/comments/:id/like', () => {
    it('should like a comment', async () => {
      const commentId = 'comment123';
      const mockComment = {
        _id: commentId,
        status: 'approved',
        likes: 5,
        like: jest.fn().mockResolvedValue()
      };

      Comment.findById.mockResolvedValue(mockComment);

      const response = await request(app)
        .post(`/api/comments/${commentId}/like`)
        .expect(200);

      expect(response.body.message).toContain('Comment liked');
      expect(mockComment.like).toHaveBeenCalled();
    });

    it('should return 404 if comment not found', async () => {
      Comment.findById.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/comments/nonexistent/like')
        .expect(404);

      expect(response.body.message).toContain('Comment not found');
    });

    it('should return 400 for unapproved comment', async () => {
      const mockComment = {
        _id: 'comment123',
        status: 'pending'
      };

      Comment.findById.mockResolvedValue(mockComment);

      const response = await request(app)
        .post('/api/comments/comment123/like')
        .expect(400);

      expect(response.body.message).toContain('Cannot like unapproved comment');
    });
  });

  describe('POST /api/comments/:id/dislike', () => {
    it('should dislike a comment', async () => {
      const commentId = 'comment123';
      const mockComment = {
        _id: commentId,
        status: 'approved',
        dislikes: 2,
        dislike: jest.fn().mockResolvedValue()
      };

      Comment.findById.mockResolvedValue(mockComment);

      const response = await request(app)
        .post(`/api/comments/${commentId}/dislike`)
        .expect(200);

      expect(response.body.message).toContain('Comment disliked');
      expect(mockComment.dislike).toHaveBeenCalled();
    });
  });

  describe('GET /api/comments/recent', () => {
    it('should get recent comments', async () => {
      const mockComments = [
        { _id: 'comment1', content: 'Recent comment 1' },
        { _id: 'comment2', content: 'Recent comment 2' }
      ];

      Comment.getRecentComments.mockResolvedValue(mockComments);

      const response = await request(app)
        .get('/api/comments/recent')
        .query({ limit: 5 })
        .expect(200);

      expect(response.body.comments).toEqual(mockComments);
      expect(Comment.getRecentComments).toHaveBeenCalledWith(5);
    });
  });

  describe('Admin Routes', () => {
    beforeEach(() => {
      verifyAdmin.mockImplementation((req, res, next) => {
        req.admin = { _id: 'admin123', name: 'Admin User' };
        next();
      });
    });

    describe('GET /api/comments/admin/pending', () => {
      it('should get pending comments for admin', async () => {
        const mockComments = [
          { _id: 'comment1', content: 'Pending comment 1', status: 'pending' },
          { _id: 'comment2', content: 'Pending comment 2', status: 'pending' }
        ];

        Comment.getPendingComments.mockResolvedValue(mockComments);
        Comment.countDocuments.mockResolvedValue(2);

        const response = await request(app)
          .get('/api/comments/admin/pending')
          .expect(200);

        expect(response.body.comments).toEqual(mockComments);
        expect(response.body.total).toBe(2);
      });
    });

    describe('PUT /api/comments/:id/approve', () => {
      it('should approve a comment', async () => {
        const commentId = 'comment123';
        const mockComment = {
          _id: commentId,
          approve: jest.fn().mockResolvedValue()
        };

        Comment.findById.mockResolvedValue(mockComment);

        const response = await request(app)
          .put(`/api/comments/${commentId}/approve`)
          .send({ reason: 'Good comment' })
          .expect(200);

        expect(response.body.message).toContain('Comment approved successfully');
        expect(mockComment.approve).toHaveBeenCalledWith('admin123', 'Good comment');
      });

      it('should return 404 if comment not found', async () => {
        Comment.findById.mockResolvedValue(null);

        const response = await request(app)
          .put('/api/comments/nonexistent/approve')
          .expect(404);

        expect(response.body.message).toContain('Comment not found');
      });
    });

    describe('PUT /api/comments/:id/reject', () => {
      it('should reject a comment', async () => {
        const commentId = 'comment123';
        const mockComment = {
          _id: commentId,
          reject: jest.fn().mockResolvedValue()
        };

        Comment.findById.mockResolvedValue(mockComment);

        const response = await request(app)
          .put(`/api/comments/${commentId}/reject`)
          .send({ reason: 'Inappropriate content' })
          .expect(200);

        expect(response.body.message).toContain('Comment rejected successfully');
        expect(mockComment.reject).toHaveBeenCalledWith('admin123', 'Inappropriate content');
      });
    });

    describe('PUT /api/comments/:id/spam', () => {
      it('should mark comment as spam', async () => {
        const commentId = 'comment123';
        const mockComment = {
          _id: commentId,
          markAsSpam: jest.fn().mockResolvedValue()
        };

        Comment.findById.mockResolvedValue(mockComment);

        const response = await request(app)
          .put(`/api/comments/${commentId}/spam`)
          .send({ reason: 'Spam detected' })
          .expect(200);

        expect(response.body.message).toContain('Comment marked as spam');
        expect(mockComment.markAsSpam).toHaveBeenCalledWith('admin123', 'Spam detected');
      });
    });

    describe('GET /api/comments/admin/stats', () => {
      it('should get comment statistics', async () => {
        const mockStats = [
          { _id: 'approved', count: 10, totalLikes: 25, totalDislikes: 2 },
          { _id: 'pending', count: 5, totalLikes: 0, totalDislikes: 0 },
          { _id: 'rejected', count: 2, totalLikes: 0, totalDislikes: 0 }
        ];

        Comment.getCommentStats.mockResolvedValue(mockStats);

        const response = await request(app)
          .get('/api/comments/admin/stats')
          .query({ blogId: 'blog123' })
          .expect(200);

        expect(response.body.total).toBe(17);
        expect(response.body.approved).toBe(10);
        expect(response.body.pending).toBe(5);
        expect(response.body.rejected).toBe(2);
        expect(response.body.totalLikes).toBe(25);
        expect(response.body.totalDislikes).toBe(2);
      });
    });

    describe('DELETE /api/comments/:id', () => {
      it('should delete a comment', async () => {
        const commentId = 'comment123';
        const mockComment = {
          _id: commentId
        };

        Comment.findById.mockResolvedValue(mockComment);
        Comment.countDocuments.mockResolvedValue(0);
        Comment.findByIdAndDelete.mockResolvedValue(mockComment);

        const response = await request(app)
          .delete(`/api/comments/${commentId}`)
          .expect(200);

        expect(response.body.message).toContain('Comment deleted successfully');
      });

      it('should return 400 if comment has replies', async () => {
        const commentId = 'comment123';
        const mockComment = {
          _id: commentId
        };

        Comment.findById.mockResolvedValue(mockComment);
        Comment.countDocuments.mockResolvedValue(2); // Has replies

        const response = await request(app)
          .delete(`/api/comments/${commentId}`)
          .expect(400);

        expect(response.body.message).toContain('Cannot delete comment with replies');
      });
    });

    describe('GET /api/comments/admin/all', () => {
      it('should get all comments with filters', async () => {
        const mockComments = [
          { _id: 'comment1', content: 'Comment 1', status: 'approved' },
          { _id: 'comment2', content: 'Comment 2', status: 'pending' }
        ];

        Comment.find.mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                skip: jest.fn().mockResolvedValue(mockComments)
              })
            })
          })
        });
        Comment.countDocuments.mockResolvedValue(2);

        const response = await request(app)
          .get('/api/comments/admin/all')
          .query({
            status: 'approved',
            blogId: 'blog123',
            authorEmail: 'john@example.com',
            sortBy: 'createdAt',
            sortOrder: 'desc',
            limit: 10,
            skip: 0
          })
          .expect(200);

        expect(response.body.comments).toEqual(mockComments);
        expect(response.body.total).toBe(2);
      });
    });
  });
});
