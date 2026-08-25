const {
  generateBlogSEOMetadata,
  generateBlogListingSEOMetadata,
  generateBlogCategorySEOMetadata,
  generateBlogTagSEOMetadata,
  generateCareerSEOMetadata,
  getDefaultCareerSEOMetadata,
  getDefaultSEOMetadata,
  validateSEOMetadata,
  sanitizeHTMLForSEO
} = require('../../utils/seoMetadata');

describe('SEO Metadata Utilities', () => {
  const mockBlog = {
    _id: '507f1f77bcf86cd799439011',
    title: 'Test Blog Post',
    description: '<p>This is a <strong>test</strong> blog post with <em>HTML</em> tags.</p>',
    author: 'Test Author',
    date: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-02T00:00:00.000Z',
    image: 'test-image.jpg',
    metaDescription: 'Custom meta description',
    metaKeywords: ['blog', 'test', 'seo'],
    ogTitle: 'Custom OG Title',
    ogDescription: 'Custom OG description',
    twitterTitle: 'Custom Twitter Title',
    twitterDescription: 'Custom Twitter description',
    generateSEOMetadata: function(baseUrl) {
      return {
        title: this.ogTitle || `${this.title} | Blog`,
        description: this.metaDescription || 'Read this blog post on our platform',
        keywords: this.metaKeywords ? this.metaKeywords.join(', ') : 'blog, test, article',
        canonicalUrl: `${baseUrl}/blog/${this._id}`,
        ogTitle: this.ogTitle || this.title,
        ogDescription: this.ogDescription || 'Read this blog post on our platform',
        ogImage: `${baseUrl}/uploads/blogs/${this.image}`,
        ogUrl: `${baseUrl}/blog/${this._id}`,
        twitterTitle: this.twitterTitle || this.title,
        twitterDescription: this.twitterDescription || 'Read this blog post on our platform',
        twitterImage: `${baseUrl}/uploads/blogs/${this.image}`,
        author: this.author,
        publishedTime: this.date,
        modifiedTime: this.updatedAt
      };
    }
  };

  describe('generateBlogSEOMetadata', () => {
    it('should generate SEO metadata for a blog post', () => {
      const baseUrl = 'http://localhost:5000';
      const seoMetadata = generateBlogSEOMetadata(mockBlog, baseUrl);

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
    });

    it('should use custom SEO fields when provided', () => {
      const baseUrl = 'http://localhost:5000';
      const seoMetadata = generateBlogSEOMetadata(mockBlog, baseUrl);

      expect(seoMetadata.title).toBe('Custom OG Title');
      expect(seoMetadata.description).toBe('Custom meta description');
      expect(seoMetadata.ogTitle).toBe('Custom OG Title');
      expect(seoMetadata.ogDescription).toBe('Custom OG description');
      expect(seoMetadata.twitterTitle).toBe('Custom Twitter Title');
      expect(seoMetadata.twitterDescription).toBe('Custom Twitter description');
    });

    it('should return default metadata when blog is null', () => {
      const baseUrl = 'http://localhost:5000';
      const seoMetadata = generateBlogSEOMetadata(null, baseUrl);

      expect(seoMetadata.title).toBe('Blog Post | Multi-Vendor Ecommerce');
      expect(seoMetadata.description).toBe('Read this blog post on our platform');
    });
  });

  describe('generateBlogListingSEOMetadata', () => {
    it('should generate SEO metadata for blog listing page', () => {
      const baseUrl = 'http://localhost:5000';
      const seoMetadata = generateBlogListingSEOMetadata(1, 5, baseUrl);

      expect(seoMetadata.title).toBe('Blog Posts | Multi-Vendor Ecommerce');
      expect(seoMetadata.description).toContain('Discover the latest blog posts');
      expect(seoMetadata.canonicalUrl).toBe(`${baseUrl}/blog`);
      expect(seoMetadata.structuredData).toHaveProperty('@context', 'https://schema.org');
      expect(seoMetadata.structuredData).toHaveProperty('@type', 'CollectionPage');
    });

    it('should generate SEO metadata for paginated blog listing', () => {
      const baseUrl = 'http://localhost:5000';
      const seoMetadata = generateBlogListingSEOMetadata(3, 10, baseUrl);

      expect(seoMetadata.title).toBe('Blog Posts - Page 3 | Multi-Vendor Ecommerce');
      expect(seoMetadata.canonicalUrl).toBe(`${baseUrl}/blog?page=3`);
    });
  });

  describe('generateBlogCategorySEOMetadata', () => {
    it('should generate SEO metadata for blog category page', () => {
      const baseUrl = 'http://localhost:5000';
      const seoMetadata = generateBlogCategorySEOMetadata('Technology', 1, baseUrl);

      expect(seoMetadata.title).toBe('Technology Blog Posts | Multi-Vendor Ecommerce');
      expect(seoMetadata.description).toContain('Explore Technology blog posts');
      expect(seoMetadata.canonicalUrl).toBe(`${baseUrl}/blog/category/technology`);
      expect(seoMetadata.structuredData).toHaveProperty('@context', 'https://schema.org');
      expect(seoMetadata.structuredData).toHaveProperty('@type', 'CollectionPage');
    });

    it('should generate SEO metadata for paginated category page', () => {
      const baseUrl = 'http://localhost:5000';
      const seoMetadata = generateBlogCategorySEOMetadata('Technology', 2, baseUrl);

      expect(seoMetadata.title).toBe('Technology Blog Posts - Page 2 | Multi-Vendor Ecommerce');
      expect(seoMetadata.canonicalUrl).toBe(`${baseUrl}/blog/category/technology?page=2`);
    });
  });

  describe('generateBlogTagSEOMetadata', () => {
    it('should generate SEO metadata for blog tag page', () => {
      const baseUrl = 'http://localhost:5000';
      const seoMetadata = generateBlogTagSEOMetadata('JavaScript', baseUrl);

      expect(seoMetadata.title).toBe('JavaScript Blog Posts | Multi-Vendor Ecommerce');
      expect(seoMetadata.description).toContain('Discover blog posts tagged with "JavaScript"');
      expect(seoMetadata.canonicalUrl).toBe(`${baseUrl}/blog/tag/javascript`);
      expect(seoMetadata.structuredData).toHaveProperty('@context', 'https://schema.org');
      expect(seoMetadata.structuredData).toHaveProperty('@type', 'CollectionPage');
    });
  });

  describe('getDefaultSEOMetadata', () => {
    it('should return default SEO metadata', () => {
      const baseUrl = 'http://localhost:5000';
      const seoMetadata = getDefaultSEOMetadata(baseUrl);

      expect(seoMetadata.title).toBe('Blog Post | Multi-Vendor Ecommerce');
      expect(seoMetadata.description).toBe('Read this blog post on our platform');
      expect(seoMetadata.canonicalUrl).toBe(`${baseUrl}/blog`);
      expect(seoMetadata.structuredData).toHaveProperty('@context', 'https://schema.org');
    });
  });

  describe('validateSEOMetadata', () => {
    it('should validate SEO metadata successfully', () => {
      const seoData = {
        metaDescription: 'This is a valid meta description under 160 characters.',
        ogTitle: 'Valid OG Title',
        ogDescription: 'Valid OG description under 160 characters.',
        twitterTitle: 'Valid Twitter Title',
        twitterDescription: 'Valid Twitter description under 200 characters.'
      };

      const validation = validateSEOMetadata(seoData);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should return validation errors for invalid SEO metadata', () => {
      const seoData = {
        metaDescription: 'This is a very long meta description that exceeds the 160 character limit and should trigger a validation error because it is too long and contains too many words.',
        ogTitle: 'This is a very long Open Graph title that exceeds the 60 character limit',
        ogDescription: 'This is a very long Open Graph description that exceeds the 160 character limit and should trigger a validation error because it contains too many words and characters.',
        twitterTitle: 'This is a very long Twitter title that exceeds the 70 character limit',
        twitterDescription: 'This is a very long Twitter description that exceeds the 200 character limit and should trigger a validation error because it contains too many words and characters and is way too long for Twitter cards.'
      };

      const validation = validateSEOMetadata(seoData);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveLength(4);
      expect(validation.errors).toContain('Meta description should be 160 characters or less');
      expect(validation.errors).toContain('Open Graph title should be 60 characters or less');
      expect(validation.errors).toContain('Open Graph description should be 160 characters or less');
      expect(validation.errors).toContain('Twitter description should be 200 characters or less');
    });
  });

  describe('sanitizeHTMLForSEO', () => {
    it('should remove HTML tags from content', () => {
      const htmlContent = '<p>This is a <strong>test</strong> with <em>HTML</em> tags.</p>';
      const sanitized = sanitizeHTMLForSEO(htmlContent);

      expect(sanitized).toBe('This is a test with HTML tags.');
    });

    it('should truncate content to max length', () => {
      const longContent = '<p>' + 'This is a very long content. '.repeat(20) + '</p>';
      const sanitized = sanitizeHTMLForSEO(longContent, 100);

      expect(sanitized.length).toBeLessThanOrEqual(100);
      expect(sanitized).toMatch(/\.\.\.$/);
    });

    it('should handle empty content', () => {
      const sanitized = sanitizeHTMLForSEO('');

      expect(sanitized).toBe('');
    });

    it('should normalize whitespace', () => {
      const htmlContent = '<p>  This   has   extra   spaces  </p>';
      const sanitized = sanitizeHTMLForSEO(htmlContent);

      expect(sanitized).toBe('This has extra spaces');
    });
  });

  describe('generateCareerSEOMetadata', () => {
    const mockCareer = {
      title: 'Frontend Developer',
      slug: 'frontend-developer',
      description: JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Build great UIs.' }] }],
      }),
      metaTitle: 'Frontend Dev | Careers',
      metaDescription: 'Join our frontend team.',
      metaKeywords: ['react', 'careers'],
      generateSEOMetadata(baseUrl) {
        return {
          title: this.metaTitle,
          description: this.metaDescription,
          keywords: this.metaKeywords.join(', '),
          canonicalUrl: `${baseUrl}/careers/${this.slug}`,
          ogTitle: this.title,
          ogDescription: this.metaDescription,
          ogUrl: `${baseUrl}/careers/${this.slug}`,
          twitterTitle: this.title,
          twitterDescription: this.metaDescription,
          structuredData: {
            '@context': 'https://schema.org',
            '@type': 'JobPosting',
            title: this.title,
          },
        };
      },
    };

    it('should generate SEO metadata for a career posting', () => {
      const baseUrl = 'http://localhost:3000';
      const seo = generateCareerSEOMetadata(mockCareer, baseUrl);

      expect(seo.title).toBe('Frontend Dev | Careers');
      expect(seo.description).toBe('Join our frontend team.');
      expect(seo.canonicalUrl).toBe(`${baseUrl}/careers/frontend-developer`);
      expect(seo.structuredData['@type']).toBe('JobPosting');
    });

    it('should return default career SEO when career is null', () => {
      const baseUrl = 'http://localhost:3000';
      const seo = generateCareerSEOMetadata(null, baseUrl);

      expect(seo).toEqual(getDefaultCareerSEOMetadata(baseUrl));
    });
  });
});
