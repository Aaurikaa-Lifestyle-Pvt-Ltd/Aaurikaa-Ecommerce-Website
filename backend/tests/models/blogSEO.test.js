const mongoose = require('mongoose');
const Blog = require('../../models/Blog');

// Mock environment variables
process.env.CLOUDFLARE_R2_PUBLIC_URL = 'https://r2.example.com';

describe('Blog Model SEO Functionality', () => {
  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear the Blog collection before each test
    await Blog.deleteMany({});
  });

  describe('SEO Metadata Generation', () => {
    it('should generate SEO metadata for a blog post', () => {
      const blog = new Blog({
        title: 'Test Blog Post',
        description: '<p>This is a test blog post with HTML tags.</p>',
        author: 'Test Author',
        date: new Date('2023-01-01'),
        image: 'test-image.jpg',
        category: new mongoose.Types.ObjectId(),
        tags: ['test', 'blog', 'seo']
      });

      const baseUrl = 'http://localhost:5000';
      const seoMetadata = blog.generateSEOMetadata(baseUrl);

      expect(seoMetadata).toHaveProperty('title');
      expect(seoMetadata).toHaveProperty('description');
      expect(seoMetadata).toHaveProperty('keywords');
      expect(seoMetadata).toHaveProperty('canonicalUrl');
      expect(seoMetadata).toHaveProperty('ogTitle');
      expect(seoMetadata).toHaveProperty('ogDescription');
      expect(seoMetadata).toHaveProperty('ogImage');
      expect(seoMetadata).toHaveProperty('twitterTitle');
      expect(seoMetadata).toHaveProperty('twitterDescription');
      expect(seoMetadata).toHaveProperty('author');
      expect(seoMetadata).toHaveProperty('publishedTime');
      expect(seoMetadata).toHaveProperty('modifiedTime');
      expect(seoMetadata).toHaveProperty('structuredData');
    });

    it('should use custom SEO fields when provided', async () => {
      const blog = new Blog({
        title: 'Test Blog Post',
        description: '<p>This is a test blog post.</p>',
        author: 'Test Author',
        date: new Date('2023-01-01'),
        image: 'test-image.jpg',
        category: new mongoose.Types.ObjectId(),
        metaDescription: 'Custom meta description',
        metaKeywords: ['custom', 'keywords'],
        ogTitle: 'Custom OG Title',
        ogDescription: 'Custom OG description',
        twitterTitle: 'Custom Twitter Title',
        twitterDescription: 'Custom Twitter description'
      });

      await blog.save();

      const baseUrl = 'http://localhost:5000';
      const seoMetadata = blog.generateSEOMetadata(baseUrl);

      expect(seoMetadata.title).toBe('Custom OG Title');
      expect(seoMetadata.description).toBe('Custom meta description');
      expect(seoMetadata.keywords).toBe('custom, keywords');
      expect(seoMetadata.ogTitle).toBe('Custom OG Title');
      expect(seoMetadata.ogDescription).toBe('Custom OG description');
      expect(seoMetadata.twitterTitle).toBe('Custom Twitter Title');
      expect(seoMetadata.twitterDescription).toBe('Custom Twitter description');
    });

    it('should generate structured data correctly', () => {
      const blog = new Blog({
        title: 'Test Blog Post',
        description: '<p>This is a test blog post.</p>',
        author: 'Test Author',
        date: new Date('2023-01-01'),
        image: 'test-image.jpg',
        category: new mongoose.Types.ObjectId(),
        _id: new mongoose.Types.ObjectId()
      });

      const baseUrl = 'http://localhost:5000';
      const structuredData = blog.generateStructuredData(
        baseUrl,
        'https://r2.example.com/uploads/blogs/test-image.jpg',
        `${baseUrl}/blog/${blog._id}`,
        'This is a test blog post.'
      );

      expect(structuredData).toHaveProperty('@context', 'https://schema.org');
      expect(structuredData).toHaveProperty('@type', 'BlogPosting');
      expect(structuredData).toHaveProperty('headline', 'Test Blog Post');
      expect(structuredData).toHaveProperty('description', 'This is a test blog post.');
      expect(structuredData).toHaveProperty('author');
      expect(structuredData).toHaveProperty('publisher');
      expect(structuredData).toHaveProperty('datePublished');
      expect(structuredData).toHaveProperty('url');
    });
  });

  describe('Auto-generation of SEO Metadata', () => {
    it('should auto-generate meta description from content', async () => {
      const blog = new Blog({
        title: 'Test Blog Post',
        description: '<p>This is a test blog post with HTML tags that should be cleaned up for the meta description.</p>',
        author: 'Test Author',
        category: new mongoose.Types.ObjectId()
      });

      await blog.save();

      expect(blog.metaDescription).toBe('This is a test blog post with HTML tags that should be cleaned up for the meta description.');
    });

    it('should auto-generate OG title from blog title', async () => {
      const blog = new Blog({
        title: 'Test Blog Post',
        description: '<p>Test description</p>',
        author: 'Test Author',
        category: new mongoose.Types.ObjectId()
      });

      await blog.save();

      expect(blog.ogTitle).toBe('Test Blog Post');
    });

    it('should auto-generate Twitter title from blog title', async () => {
      const blog = new Blog({
        title: 'Test Blog Post',
        description: '<p>Test description</p>',
        author: 'Test Author',
        category: new mongoose.Types.ObjectId()
      });

      await blog.save();

      expect(blog.twitterTitle).toBe('Test Blog Post');
    });

    it('should auto-generate OG description from content', async () => {
      const blog = new Blog({
        title: 'Test Blog Post',
        description: '<p>This is a test blog post with HTML tags.</p>',
        author: 'Test Author',
        category: new mongoose.Types.ObjectId()
      });

      await blog.save();

      expect(blog.ogDescription).toBe('This is a test blog post with HTML tags.');
    });

    it('should auto-generate Twitter description from content', async () => {
      const blog = new Blog({
        title: 'Test Blog Post',
        description: '<p>This is a test blog post with HTML tags that should be cleaned up for the Twitter description.</p>',
        author: 'Test Author',
        category: new mongoose.Types.ObjectId()
      });

      await blog.save();

      expect(blog.twitterDescription).toBe('This is a test blog post with HTML tags that should be cleaned up for the Twitter description.');
    });

    it('should not override custom SEO fields', async () => {
      const blog = new Blog({
        title: 'Test Blog Post',
        description: '<p>This is a test blog post.</p>',
        author: 'Test Author',
        category: new mongoose.Types.ObjectId(),
        metaDescription: 'Custom meta description',
        ogTitle: 'Custom OG Title',
        twitterTitle: 'Custom Twitter Title'
      });

      await blog.save();

      expect(blog.metaDescription).toBe('Custom meta description');
      expect(blog.ogTitle).toBe('Custom OG Title');
      expect(blog.twitterTitle).toBe('Custom Twitter Title');
    });
  });

  describe('Image URL Generation', () => {
    it('should pass through full R2 image URLs', () => {
      const r2Url = 'https://cdn.example.com/blogs/2026/05/how-to-style.webp';
      const blog = new Blog({
        title: 'Test Blog Post',
        description: '<p>Test description</p>',
        author: 'Test Author',
        image: r2Url,
        category: new mongoose.Types.ObjectId()
      });

      const seoMetadata = blog.generateSEOMetadata('http://localhost:5000');

      expect(seoMetadata.ogImage).toBe(r2Url);
      expect(seoMetadata.twitterImage).toBe(r2Url);
    });

    it('should resolve legacy relative blog image paths', () => {
      const blog = new Blog({
        title: 'Test Blog Post',
        description: '<p>Test description</p>',
        author: 'Test Author',
        image: 'test-image.jpg',
        category: new mongoose.Types.ObjectId()
      });

      const baseUrl = 'http://localhost:5000';
      const seoMetadata = blog.generateSEOMetadata(baseUrl);

      expect(seoMetadata.ogImage).toBe('http://localhost:5000/uploads/blogs/test-image.jpg');
      expect(seoMetadata.twitterImage).toBe('http://localhost:5000/uploads/blogs/test-image.jpg');
    });

    it('should use default image when no image is provided', () => {
      const blog = new Blog({
        title: 'Test Blog Post',
        description: '<p>Test description</p>',
        author: 'Test Author',
        category: new mongoose.Types.ObjectId()
      });

      const baseUrl = 'http://localhost:5000';
      const seoMetadata = blog.generateSEOMetadata(baseUrl);

      expect(seoMetadata.ogImage).toBe('http://localhost:5000/images/default-blog.jpg');
      expect(seoMetadata.twitterImage).toBe('http://localhost:5000/images/default-blog.jpg');
    });
  });

  describe('URL Generation', () => {
    it('should generate correct canonical URL', () => {
      const blog = new Blog({
        title: 'Test Blog Post',
        description: '<p>Test description</p>',
        author: 'Test Author',
        category: new mongoose.Types.ObjectId(),
        _id: new mongoose.Types.ObjectId()
      });

      const baseUrl = 'http://localhost:5000';
      const seoMetadata = blog.generateSEOMetadata(baseUrl);

      expect(seoMetadata.canonicalUrl).toBe(`${baseUrl}/blog/${blog._id}`);
      expect(seoMetadata.ogUrl).toBe(`${baseUrl}/blog/${blog._id}`);
    });

    it('should use custom canonical URL when provided', async () => {
      const blog = new Blog({
        title: 'Test Blog Post',
        description: '<p>Test description</p>',
        author: 'Test Author',
        category: new mongoose.Types.ObjectId(),
        canonicalUrl: 'https://custom-domain.com/blog/test-post'
      });

      await blog.save();

      const baseUrl = 'http://localhost:5000';
      const seoMetadata = blog.generateSEOMetadata(baseUrl);

      expect(seoMetadata.canonicalUrl).toBe('https://custom-domain.com/blog/test-post');
    });
  });
});
