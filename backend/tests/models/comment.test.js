// backend/tests/models/comment.test.js
const mongoose = require('mongoose');
const Comment = require('../../models/Comment');
const Blog = require('../../models/Blog');

// Mock the Blog model
jest.mock('../../models/Blog');

// Mock mongoose save method
const mockSave = jest.fn();
const mockFind = jest.fn();
const mockFindById = jest.fn();
const mockAggregate = jest.fn();
const mockCountDocuments = jest.fn();

// Mock Comment model methods
Comment.prototype.save = mockSave;
Comment.find = mockFind;
Comment.findById = mockFindById;
Comment.aggregate = mockAggregate;
Comment.countDocuments = mockCountDocuments;

describe('Comment Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Comment Creation', () => {
    it('should create a comment with valid data', async () => {
      const commentData = {
        blog: new mongoose.Types.ObjectId(),
        content: 'This is a test comment',
        author: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0'
      };

      const mockSavedComment = {
        _id: new mongoose.Types.ObjectId(),
        ...commentData,
        status: 'pending',
        likes: 0,
        dislikes: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSave.mockResolvedValue(mockSavedComment);

      const comment = new Comment(commentData);
      const savedComment = await comment.save();

      expect(mockSave).toHaveBeenCalled();
      expect(savedComment._id).toBeDefined();
      expect(savedComment.content).toBe(commentData.content);
      expect(savedComment.author.name).toBe(commentData.author.name);
      expect(savedComment.author.email).toBe(commentData.author.email);
      expect(savedComment.status).toBe('pending');
      expect(savedComment.likes).toBe(0);
      expect(savedComment.dislikes).toBe(0);
    });

    it('should require blog reference', async () => {
      const commentData = {
        content: 'This is a test comment',
        author: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        ipAddress: '127.0.0.1'
      };

      const comment = new Comment(commentData);
      
      await expect(comment.save()).rejects.toThrow('Comment must be associated with a blog post');
    });

    it('should require comment content', async () => {
      const commentData = {
        blog: new mongoose.Types.ObjectId(),
        author: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        ipAddress: '127.0.0.1'
      };

      mockSave.mockRejectedValue(new Error('Comment content is required'));

      const comment = new Comment(commentData);
      
      await expect(comment.save()).rejects.toThrow('Comment content is required');
    });

    it('should require author name', async () => {
      const commentData = {
        blog: new mongoose.Types.ObjectId(),
        content: 'This is a test comment',
        author: {
          email: 'john@example.com'
        },
        ipAddress: '127.0.0.1'
      };

      const comment = new Comment(commentData);
      
      await expect(comment.save()).rejects.toThrow('Author name is required');
    });

    it('should require author email', async () => {
      const commentData = {
        blog: new mongoose.Types.ObjectId(),
        content: 'This is a test comment',
        author: {
          name: 'John Doe'
        },
        ipAddress: '127.0.0.1'
      };

      const comment = new Comment(commentData);
      
      await expect(comment.save()).rejects.toThrow('Author email is required');
    });

    it('should validate email format', async () => {
      const commentData = {
        blog: new mongoose.Types.ObjectId(),
        content: 'This is a test comment',
        author: {
          name: 'John Doe',
          email: 'invalid-email'
        },
        ipAddress: '127.0.0.1'
      };

      const comment = new Comment(commentData);
      
      await expect(comment.save()).rejects.toThrow('Please provide a valid email address');
    });

    it('should validate content length', async () => {
      const commentData = {
        blog: new mongoose.Types.ObjectId(),
        content: 'a'.repeat(1001), // Exceeds max length
        author: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        ipAddress: '127.0.0.1'
      };

      const comment = new Comment(commentData);
      
      await expect(comment.save()).rejects.toThrow('Comment cannot exceed 1000 characters');
    });
  });

  describe('Comment Status', () => {
    it('should default to pending status', async () => {
      const commentData = {
        blog: new mongoose.Types.ObjectId(),
        content: 'This is a test comment',
        author: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        ipAddress: '127.0.0.1'
      };

      const comment = new Comment(commentData);
      const savedComment = await comment.save();

      expect(savedComment.status).toBe('pending');
    });

    it('should accept valid status values', async () => {
      const validStatuses = ['pending', 'approved', 'rejected', 'spam'];
      
      for (const status of validStatuses) {
        const commentData = {
          blog: new mongoose.Types.ObjectId(),
          content: 'This is a test comment',
          author: {
            name: 'John Doe',
            email: 'john@example.com'
          },
          ipAddress: '127.0.0.1',
          status
        };

        const comment = new Comment(commentData);
        const savedComment = await comment.save();

        expect(savedComment.status).toBe(status);
      }
    });
  });

  describe('Comment Methods', () => {
    let comment;

    beforeEach(async () => {
      const commentData = {
        blog: new mongoose.Types.ObjectId(),
        content: 'This is a test comment',
        author: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        ipAddress: '127.0.0.1'
      };

      comment = new Comment(commentData);
      await comment.save();
    });

    it('should approve comment', async () => {
      const moderatorId = new mongoose.Types.ObjectId();
      const reason = 'Good comment';

      await comment.approve(moderatorId, reason);

      expect(comment.status).toBe('approved');
      expect(comment.moderatedBy.toString()).toBe(moderatorId.toString());
      expect(comment.moderatedAt).toBeDefined();
      expect(comment.moderationReason).toBe(reason);
    });

    it('should reject comment', async () => {
      const moderatorId = new mongoose.Types.ObjectId();
      const reason = 'Inappropriate content';

      await comment.reject(moderatorId, reason);

      expect(comment.status).toBe('rejected');
      expect(comment.moderatedBy.toString()).toBe(moderatorId.toString());
      expect(comment.moderatedAt).toBeDefined();
      expect(comment.moderationReason).toBe(reason);
    });

    it('should mark comment as spam', async () => {
      const moderatorId = new mongoose.Types.ObjectId();
      const reason = 'Spam detected';

      await comment.markAsSpam(moderatorId, reason);

      expect(comment.status).toBe('spam');
      expect(comment.moderatedBy.toString()).toBe(moderatorId.toString());
      expect(comment.moderatedAt).toBeDefined();
      expect(comment.moderationReason).toBe(reason);
    });

    it('should like comment', async () => {
      const initialLikes = comment.likes;
      await comment.like();

      expect(comment.likes).toBe(initialLikes + 1);
    });

    it('should dislike comment', async () => {
      const initialDislikes = comment.dislikes;
      await comment.dislike();

      expect(comment.dislikes).toBe(initialDislikes + 1);
    });
  });

  describe('Comment Statics', () => {
    let blogId;

    beforeEach(async () => {
      blogId = new mongoose.Types.ObjectId();
      
      // Create test comments
      const comments = [
        {
          blog: blogId,
          content: 'Comment 1',
          author: { name: 'User 1', email: 'user1@example.com' },
          ipAddress: '127.0.0.1',
          status: 'approved'
        },
        {
          blog: blogId,
          content: 'Comment 2',
          author: { name: 'User 2', email: 'user2@example.com' },
          ipAddress: '127.0.0.1',
          status: 'pending'
        },
        {
          blog: blogId,
          content: 'Comment 3',
          author: { name: 'User 3', email: 'user3@example.com' },
          ipAddress: '127.0.0.1',
          status: 'approved',
          likes: 5
        }
      ];

      await Comment.insertMany(comments);
    });

    it('should get comments by blog', async () => {
      const comments = await Comment.getByBlog(blogId, { status: 'approved' });

      expect(comments).toHaveLength(2);
      expect(comments.every(c => c.status === 'approved')).toBe(true);
    });

    it('should get pending comments', async () => {
      const comments = await Comment.getPendingComments();

      expect(comments).toHaveLength(1);
      expect(comments[0].status).toBe('pending');
    });

    it('should get comment statistics', async () => {
      const stats = await Comment.getCommentStats(blogId);

      expect(stats).toHaveLength(2); // approved and pending
      const approvedStat = stats.find(s => s._id === 'approved');
      const pendingStat = stats.find(s => s._id === 'pending');

      expect(approvedStat.count).toBe(2);
      expect(pendingStat.count).toBe(1);
      expect(approvedStat.totalLikes).toBe(5);
    });

    it('should get recent comments', async () => {
      const comments = await Comment.getRecentComments(2);

      expect(comments).toHaveLength(2);
      expect(comments.every(c => c.status === 'approved')).toBe(true);
    });
  });

  describe('Comment Virtuals', () => {
    it('should calculate comment depth', async () => {
      const parentComment = new Comment({
        blog: new mongoose.Types.ObjectId(),
        content: 'Parent comment',
        author: { name: 'User 1', email: 'user1@example.com' },
        ipAddress: '127.0.0.1'
      });
      await parentComment.save();

      const childComment = new Comment({
        blog: parentComment.blog,
        content: 'Child comment',
        author: { name: 'User 2', email: 'user2@example.com' },
        ipAddress: '127.0.0.1',
        parentComment: parentComment._id
      });
      await childComment.save();

      expect(parentComment.depth).toBe(0);
      expect(childComment.depth).toBe(1);
    });

    it('should generate comment URL', async () => {
      const blogId = new mongoose.Types.ObjectId();
      const comment = new Comment({
        blog: blogId,
        content: 'Test comment',
        author: { name: 'User', email: 'user@example.com' },
        ipAddress: '127.0.0.1'
      });
      await comment.save();

      expect(comment.url).toBe(`/blog/${blogId}/comments/${comment._id}`);
    });
  });

  describe('Comment Pre-save Middleware', () => {
    it('should mark comment as spam for spam keywords', async () => {
      const commentData = {
        blog: new mongoose.Types.ObjectId(),
        content: 'This is a spam comment with casino and viagra',
        author: {
          name: 'Spammer',
          email: 'spammer@example.com'
        },
        ipAddress: '127.0.0.1'
      };

      const comment = new Comment(commentData);
      const savedComment = await comment.save();

      expect(savedComment.status).toBe('spam');
    });

    it('should update edited timestamp when content changes', async () => {
      const commentData = {
        blog: new mongoose.Types.ObjectId(),
        content: 'Original comment',
        author: {
          name: 'User',
          email: 'user@example.com'
        },
        ipAddress: '127.0.0.1'
      };

      const comment = new Comment(commentData);
      await comment.save();

      expect(comment.isEdited).toBe(false);
      expect(comment.editedAt).toBeUndefined();

      comment.content = 'Edited comment';
      await comment.save();

      expect(comment.isEdited).toBe(true);
      expect(comment.editedAt).toBeDefined();
    });
  });
});
