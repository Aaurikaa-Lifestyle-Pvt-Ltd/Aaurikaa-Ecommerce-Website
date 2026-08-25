// backend/tests/models/blogEngagement.test.js
const mongoose = require('mongoose');
const Blog = require('../../models/Blog');
const BlogCategory = require('../../models/BlogCategory');

describe('Blog Engagement Features', () => {
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

  describe('Like functionality', () => {
    test('should increment likes count', async () => {
      const initialLikes = testBlog.likes;
      await testBlog.like();
      
      expect(testBlog.likes).toBe(initialLikes + 1);
    });

    test('should track user who liked', async () => {
      const userId = new mongoose.Types.ObjectId();
      await testBlog.like(userId);
      
      expect(testBlog.likedBy).toContainEqual(userId);
    });

    test('should not add duplicate user to likedBy array', async () => {
      const userId = new mongoose.Types.ObjectId();
      const initialLength = testBlog.likedBy.length;
      
      await testBlog.like(userId);
      await testBlog.like(userId);
      
      expect(testBlog.likedBy.length).toBe(initialLength + 1);
    });

    test('should remove like when removeLike is called', async () => {
      const userId = new mongoose.Types.ObjectId();
      await testBlog.like(userId);
      const likesAfterLike = testBlog.likes;
      
      await testBlog.removeLike(userId);
      
      expect(testBlog.likes).toBe(likesAfterLike - 1);
      expect(testBlog.likedBy).not.toContainEqual(userId);
    });
  });

  describe('Dislike functionality', () => {
    test('should increment dislikes count', async () => {
      const initialDislikes = testBlog.dislikes;
      await testBlog.dislike();
      
      expect(testBlog.dislikes).toBe(initialDislikes + 1);
    });

    test('should track user who disliked', async () => {
      const userId = new mongoose.Types.ObjectId();
      await testBlog.dislike(userId);
      
      expect(testBlog.dislikedBy).toContainEqual(userId);
    });

    test('should not add duplicate user to dislikedBy array', async () => {
      const userId = new mongoose.Types.ObjectId();
      const initialLength = testBlog.dislikedBy.length;
      
      await testBlog.dislike(userId);
      await testBlog.dislike(userId);
      
      expect(testBlog.dislikedBy.length).toBe(initialLength + 1);
    });

    test('should remove dislike when removeDislike is called', async () => {
      const userId = new mongoose.Types.ObjectId();
      await testBlog.dislike(userId);
      const dislikesAfterDislike = testBlog.dislikes;
      
      await testBlog.removeDislike(userId);
      
      expect(testBlog.dislikes).toBe(dislikesAfterDislike - 1);
      expect(testBlog.dislikedBy).not.toContainEqual(userId);
    });
  });

  describe('View tracking', () => {
    test('should increment views count', async () => {
      const initialViews = testBlog.views;
      await testBlog.incrementViews();
      
      expect(testBlog.views).toBe(initialViews + 1);
    });
  });

  describe('Share tracking', () => {
    test('should increment shares count', async () => {
      const initialShares = testBlog.shares;
      await testBlog.incrementShares();
      
      expect(testBlog.shares).toBe(initialShares + 1);
    });
  });

  describe('Static methods for engagement analytics', () => {
    beforeEach(async () => {
      // Create additional test blogs with different engagement levels
      const blog2 = new Blog({
        title: 'Popular Blog',
        description: 'This blog has many likes',
        category: testCategory._id,
        author: 'Popular Author',
        status: 'published',
        likes: 100,
        views: 500,
        shares: 50
      });
      await blog2.save();

      const blog3 = new Blog({
        title: 'Viewed Blog',
        description: 'This blog has many views',
        category: testCategory._id,
        author: 'Viewed Author',
        status: 'published',
        likes: 20,
        views: 1000,
        shares: 10
      });
      await blog3.save();
    });

    test('should get most liked blogs', async () => {
      const mostLiked = await Blog.getMostLiked(5);
      
      expect(mostLiked).toHaveLength(3);
      expect(mostLiked[0].likes).toBeGreaterThanOrEqual(mostLiked[1].likes);
      expect(mostLiked[1].likes).toBeGreaterThanOrEqual(mostLiked[2].likes);
    });

    test('should get most viewed blogs', async () => {
      const mostViewed = await Blog.getMostViewed(5);
      
      expect(mostViewed).toHaveLength(3);
      expect(mostViewed[0].views).toBeGreaterThanOrEqual(mostViewed[1].views);
      expect(mostViewed[1].views).toBeGreaterThanOrEqual(mostViewed[2].views);
    });

    test('should get most shared blogs', async () => {
      const mostShared = await Blog.getMostShared(5);
      
      expect(mostShared).toHaveLength(3);
      expect(mostShared[0].shares).toBeGreaterThanOrEqual(mostShared[1].shares);
      expect(mostShared[1].shares).toBeGreaterThanOrEqual(mostShared[2].shares);
    });

    test('should get engagement statistics', async () => {
      const stats = await Blog.getEngagementStats();
      
      expect(stats).toHaveLength(1);
      expect(stats[0]).toHaveProperty('totalLikes');
      expect(stats[0]).toHaveProperty('totalDislikes');
      expect(stats[0]).toHaveProperty('totalViews');
      expect(stats[0]).toHaveProperty('totalShares');
      expect(stats[0]).toHaveProperty('averageLikes');
      expect(stats[0]).toHaveProperty('averageViews');
      expect(stats[0]).toHaveProperty('blogCount');
      expect(stats[0].blogCount).toBe(3);
    });
  });

  describe('Engagement validation', () => {
    test('should not allow negative likes', async () => {
      testBlog.likes = -1;
      await expect(testBlog.save()).rejects.toThrow();
    });

    test('should not allow negative dislikes', async () => {
      testBlog.dislikes = -1;
      await expect(testBlog.save()).rejects.toThrow();
    });

    test('should not allow negative views', async () => {
      testBlog.views = -1;
      await expect(testBlog.save()).rejects.toThrow();
    });

    test('should not allow negative shares', async () => {
      testBlog.shares = -1;
      await expect(testBlog.save()).rejects.toThrow();
    });
  });
});
