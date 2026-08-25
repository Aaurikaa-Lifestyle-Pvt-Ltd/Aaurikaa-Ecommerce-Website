// backend/routes/commentRoutes.js
const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const Blog = require('../models/Blog');
const { withAdminAuth } = require('../utils/adminAuthChain');
const contentView = withAdminAuth('content', 'view');
const contentManage = withAdminAuth('content', 'manage');

/* -------------------------------------------------------------------------- */
/*                         📝 PUBLIC ROUTES (No Auth)                         */
/* -------------------------------------------------------------------------- */

// GET → /api/comments/blog/:blogId
router.get('/blog/:blogId', async (req, res) => {
  try {
    const { blogId } = req.params;
    const {
      status = 'approved',
      includeReplies = true,
      sortBy = 'createdAt',
      sortOrder = 'asc',
      limit = 50,
      skip = 0
    } = req.query;

    // Validate blog exists
    const blog = await Blog.findById(blogId);
    if (!blog) {
      return res.status(404).json({ message: '❌ Blog post not found' });
    }

    const options = {
      status,
      includeReplies: includeReplies === 'true',
      sortBy,
      sortOrder,
      limit: parseInt(limit),
      skip: parseInt(skip)
    };

    const comments = await Comment.getByBlog(blogId, options);
    const totalComments = await Comment.countDocuments({ 
      blog: blogId, 
      status,
      ...(includeReplies === 'false' ? { parentComment: null } : {})
    });

    res.json({
      comments,
      total: totalComments,
      page: Math.floor(skip / limit) + 1,
      pages: Math.ceil(totalComments / limit),
      hasNextPage: (skip + parseInt(limit)) < totalComments,
      hasPrevPage: skip > 0
    });
  } catch (err) {
    console.error('❌ Get comments error:', err.message);
    res.status(500).json({ message: '❌ Failed to fetch comments' });
  }
});

// GET → /api/comments/blog/:blogId/threaded
router.get('/blog/:blogId/threaded', async (req, res) => {
  try {
    const { blogId } = req.params;
    const {
      status = 'approved',
      sortBy = 'createdAt',
      sortOrder = 'asc'
    } = req.query;

    // Validate blog exists
    const blog = await Blog.findById(blogId);
    if (!blog) {
      return res.status(404).json({ message: '❌ Blog post not found' });
    }

    const options = {
      status,
      sortBy,
      sortOrder
    };

    const allComments = await Comment.getThreadedComments(blogId, options);
    
    // Organize comments into threads
    const topLevelComments = allComments.filter(comment => !comment.parentComment);
    const replies = allComments.filter(comment => comment.parentComment);
    
    // Group replies by parent comment
    const repliesByParent = {};
    replies.forEach(reply => {
      const parentId = reply.parentComment._id.toString();
      if (!repliesByParent[parentId]) {
        repliesByParent[parentId] = [];
      }
      repliesByParent[parentId].push(reply);
    });
    
    // Attach replies to their parent comments
    const threadedComments = topLevelComments.map(comment => ({
      ...comment.toObject(),
      replies: repliesByParent[comment._id.toString()] || []
    }));

    const totalComments = await Comment.getCommentCountWithReplies(blogId, status);

    res.json({
      comments: threadedComments,
      total: totalComments,
      topLevelCount: topLevelComments.length,
      repliesCount: replies.length
    });
  } catch (err) {
    console.error('❌ Get threaded comments error:', err.message);
    res.status(500).json({ message: '❌ Failed to fetch threaded comments' });
  }
});

// GET → /api/comments/:id/replies
router.get('/:id/replies', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status = 'approved',
      sortBy = 'createdAt',
      sortOrder = 'asc'
    } = req.query;

    // Validate parent comment exists
    const parentComment = await Comment.findById(id);
    if (!parentComment) {
      return res.status(404).json({ message: '❌ Parent comment not found' });
    }

    const options = {
      status,
      sortBy,
      sortOrder
    };

    const replies = await Comment.getReplies(id, options);

    res.json({
      replies,
      total: replies.length,
      parentComment: {
        _id: parentComment._id,
        author: parentComment.author,
        content: parentComment.content,
        createdAt: parentComment.createdAt
      }
    });
  } catch (err) {
    console.error('❌ Get replies error:', err.message);
    res.status(500).json({ message: '❌ Failed to fetch replies' });
  }
});

// POST → /api/comments
router.post('/', async (req, res) => {
  try {
    const {
      blogId,
      content,
      authorName,
      authorEmail,
      authorWebsite,
      parentCommentId
    } = req.body;

    // Validate required fields
    if (!blogId || !content || !authorName || !authorEmail) {
      return res.status(400).json({ 
        message: '❌ Missing required fields: blogId, content, authorName, authorEmail' 
      });
    }

    // Validate blog exists
    const blog = await Blog.findById(blogId);
    if (!blog) {
      return res.status(404).json({ message: '❌ Blog post not found' });
    }

    // Validate parent comment if provided
    if (parentCommentId) {
      const parentComment = await Comment.findById(parentCommentId);
      if (!parentComment || parentComment.blog.toString() !== blogId) {
        return res.status(400).json({ message: '❌ Invalid parent comment' });
      }
    }

    // Get client IP and user agent
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent');

    // Create comment
    const comment = new Comment({
      blog: blogId,
      content: content.trim(),
      author: {
        name: authorName.trim(),
        email: authorEmail.trim(),
        website: authorWebsite ? authorWebsite.trim() : undefined
      },
      parentComment: parentCommentId || null,
      ipAddress,
      userAgent
    });

    await comment.save();

    // Populate the comment for response
    await comment.populate('moderatedBy', 'name email');

    res.status(201).json({
      message: '✅ Comment submitted successfully',
      comment: {
        _id: comment._id,
        content: comment.content,
        author: comment.author,
        status: comment.status,
        createdAt: comment.createdAt,
        parentComment: comment.parentComment
      }
    });
  } catch (err) {
    console.error('❌ Create comment error:', err.message);
    
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ 
        message: '❌ Validation error', 
        errors 
      });
    }
    
    res.status(500).json({ message: '❌ Failed to create comment' });
  }
});

// POST → /api/comments/:id/like
router.post('/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({ message: '❌ Comment not found' });
    }
    
    if (comment.status !== 'approved') {
      return res.status(400).json({ message: '❌ Cannot like unapproved comment' });
    }
    
    await comment.like();
    
    res.json({
      message: '✅ Comment liked',
      likes: comment.likes
    });
  } catch (err) {
    console.error('❌ Like comment error:', err.message);
    res.status(500).json({ message: '❌ Failed to like comment' });
  }
});

// POST → /api/comments/:id/dislike
router.post('/:id/dislike', async (req, res) => {
  try {
    const { id } = req.params;
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({ message: '❌ Comment not found' });
    }
    
    if (comment.status !== 'approved') {
      return res.status(400).json({ message: '❌ Cannot dislike unapproved comment' });
    }
    
    await comment.dislike();
    
    res.json({
      message: '✅ Comment disliked',
      dislikes: comment.dislikes
    });
  } catch (err) {
    console.error('❌ Dislike comment error:', err.message);
    res.status(500).json({ message: '❌ Failed to dislike comment' });
  }
});

// GET → /api/comments/recent
router.get('/recent', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const comments = await Comment.getRecentComments(parseInt(limit));
    
    res.json({ comments });
  } catch (err) {
    console.error('❌ Get recent comments error:', err.message);
    res.status(500).json({ message: '❌ Failed to fetch recent comments' });
  }
});

/* -------------------------------------------------------------------------- */
/*                         🔒 ADMIN ROUTES (Auth Required)                    */
/* -------------------------------------------------------------------------- */

// GET → /api/comments/admin/pending
router.get('/admin/pending', ...contentView, async (req, res) => {
  try {
    const { limit = 20, skip = 0 } = req.query;
    const comments = await Comment.getPendingComments(parseInt(limit), parseInt(skip));
    const totalPending = await Comment.countDocuments({ status: 'pending' });
    
    res.json({
      comments,
      total: totalPending,
      page: Math.floor(skip / limit) + 1,
      pages: Math.ceil(totalPending / limit)
    });
  } catch (err) {
    console.error('❌ Get pending comments error:', err.message);
    res.status(500).json({ message: '❌ Failed to fetch pending comments' });
  }
});

// PUT → /api/comments/:id/approve
router.put('/:id/approve', ...contentManage, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;
    
    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: '❌ Comment not found' });
    }
    
    await comment.approve(req.user.id, reason);
    
    res.json({
      message: '✅ Comment approved successfully',
      comment: {
        _id: comment._id,
        status: comment.status,
        moderatedBy: comment.moderatedBy,
        moderatedAt: comment.moderatedAt
      }
    });
  } catch (err) {
    console.error('❌ Approve comment error:', err.message);
    res.status(500).json({ message: '❌ Failed to approve comment' });
  }
});

// PUT → /api/comments/:id/reject
router.put('/:id/reject', ...contentManage, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;
    
    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: '❌ Comment not found' });
    }
    
    await comment.reject(req.user.id, reason);
    
    res.json({
      message: '✅ Comment rejected successfully',
      comment: {
        _id: comment._id,
        status: comment.status,
        moderatedBy: comment.moderatedBy,
        moderatedAt: comment.moderatedAt
      }
    });
  } catch (err) {
    console.error('❌ Reject comment error:', err.message);
    res.status(500).json({ message: '❌ Failed to reject comment' });
  }
});

// PUT → /api/comments/:id/spam
router.put('/:id/spam', ...contentManage, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;
    
    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: '❌ Comment not found' });
    }
    
    await comment.markAsSpam(req.user.id, reason);
    
    res.json({
      message: '✅ Comment marked as spam',
      comment: {
        _id: comment._id,
        status: comment.status,
        moderatedBy: comment.moderatedBy,
        moderatedAt: comment.moderatedAt
      }
    });
  } catch (err) {
    console.error('❌ Mark comment as spam error:', err.message);
    res.status(500).json({ message: '❌ Failed to mark comment as spam' });
  }
});

// GET → /api/comments/admin/stats
router.get('/admin/stats', ...contentView, async (req, res) => {
  try {
    const { blogId } = req.query;
    const stats = await Comment.getCommentStats(blogId);
    
    // Format stats
    const formattedStats = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      spam: 0,
      totalLikes: 0,
      totalDislikes: 0
    };
    
    stats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
      formattedStats.total += stat.count;
      formattedStats.totalLikes += stat.totalLikes || 0;
      formattedStats.totalDislikes += stat.totalDislikes || 0;
    });
    
    res.json(formattedStats);
  } catch (err) {
    console.error('❌ Get comment stats error:', err.message);
    res.status(500).json({ message: '❌ Failed to fetch comment statistics' });
  }
});

// DELETE → /api/comments/:id
router.delete('/:id', ...contentManage, async (req, res) => {
  try {
    const { id } = req.params;
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({ message: '❌ Comment not found' });
    }
    
    // Check if comment has replies
    const replies = await Comment.countDocuments({ parentComment: id });
    if (replies > 0) {
      return res.status(400).json({ 
        message: '❌ Cannot delete comment with replies. Please delete replies first.' 
      });
    }
    
    await Comment.findByIdAndDelete(id);
    
    res.json({ message: '✅ Comment deleted successfully' });
  } catch (err) {
    console.error('❌ Delete comment error:', err.message);
    res.status(500).json({ message: '❌ Failed to delete comment' });
  }
});

// GET → /api/comments/admin/all
router.get('/admin/all', ...contentView, async (req, res) => {
  try {
    const {
      status,
      blogId,
      authorEmail,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit = 50,
      skip = 0
    } = req.query;
    
    let query = {};
    
    if (status) query.status = status;
    if (blogId) query.blog = blogId;
    if (authorEmail) query['author.email'] = new RegExp(authorEmail, 'i');
    
    const comments = await Comment.find(query)
      .populate('blog', 'title slug')
      .populate('moderatedBy', 'name email')
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    const total = await Comment.countDocuments(query);
    
    res.json({
      comments,
      total,
      page: Math.floor(skip / limit) + 1,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('❌ Get all comments error:', err.message);
    res.status(500).json({ message: '❌ Failed to fetch comments' });
  }
});

module.exports = router;
