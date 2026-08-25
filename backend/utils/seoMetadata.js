// backend/utils/seoMetadata.js
const Blog = require('../models/Blog');
const Career = require('../models/Career');

/**
 * Generate comprehensive SEO metadata for blog posts
 * @param {Object} blog - Blog document
 * @param {string} baseUrl - Base URL for the application
 * @returns {Object} Complete SEO metadata object
 */
const generateBlogSEOMetadata = (blog, baseUrl = 'http://localhost:5000') => {
  if (!blog) {
    return getDefaultSEOMetadata(baseUrl);
  }

  // Use the blog's built-in SEO generation method
  return blog.generateSEOMetadata(baseUrl);
};

/**
 * Generate SEO metadata for blog listing pages
 * @param {number} page - Current page number
 * @param {number} totalPages - Total number of pages
 * @param {string} baseUrl - Base URL for the application
 * @returns {Object} SEO metadata for blog listing
 */
const generateBlogListingSEOMetadata = (page = 1, totalPages = 1, baseUrl = 'http://localhost:5000') => {
  const title = page > 1 ? `Blog Posts - Page ${page} | Multi-Vendor Ecommerce` : 'Blog Posts | Multi-Vendor Ecommerce';
  const description = 'Discover the latest blog posts, articles, and news from our platform. Stay updated with industry insights and company updates.';
  
  return {
    title,
    description,
    keywords: 'blog, articles, news, updates, insights, industry news',
    canonicalUrl: page > 1 ? `${baseUrl}/blog?page=${page}` : `${baseUrl}/blog`,
    ogTitle: title,
    ogDescription: description,
    ogImage: `${baseUrl}/images/blog-listing-og.jpg`,
    ogUrl: page > 1 ? `${baseUrl}/blog?page=${page}` : `${baseUrl}/blog`,
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: `${baseUrl}/images/blog-listing-og.jpg`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "Blog Posts",
      "description": description,
      "url": page > 1 ? `${baseUrl}/blog?page=${page}` : `${baseUrl}/blog`,
      "mainEntity": {
        "@type": "ItemList",
        "numberOfItems": totalPages
      }
    }
  };
};

/**
 * Generate SEO metadata for blog category pages
 * @param {string} categoryName - Name of the blog category
 * @param {number} page - Current page number
 * @param {string} baseUrl - Base URL for the application
 * @returns {Object} SEO metadata for blog category
 */
const generateBlogCategorySEOMetadata = (categoryName, page = 1, baseUrl = 'http://localhost:5000') => {
  const title = page > 1 
    ? `${categoryName} Blog Posts - Page ${page} | Multi-Vendor Ecommerce`
    : `${categoryName} Blog Posts | Multi-Vendor Ecommerce`;
  const description = `Explore ${categoryName} blog posts and articles. Stay informed with the latest ${categoryName.toLowerCase()} content and insights.`;
  
  return {
    title,
    description,
    keywords: `blog, ${categoryName.toLowerCase()}, articles, news, insights`,
    canonicalUrl: page > 1 ? `${baseUrl}/blog/category/${categoryName.toLowerCase()}?page=${page}` : `${baseUrl}/blog/category/${categoryName.toLowerCase()}`,
    ogTitle: title,
    ogDescription: description,
    ogImage: `${baseUrl}/images/category-${categoryName.toLowerCase()}-og.jpg`,
    ogUrl: page > 1 ? `${baseUrl}/blog/category/${categoryName.toLowerCase()}?page=${page}` : `${baseUrl}/blog/category/${categoryName.toLowerCase()}`,
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: `${baseUrl}/images/category-${categoryName.toLowerCase()}-og.jpg`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": `${categoryName} Blog Posts`,
      "description": description,
      "url": page > 1 ? `${baseUrl}/blog/category/${categoryName.toLowerCase()}?page=${page}` : `${baseUrl}/blog/category/${categoryName.toLowerCase()}`,
      "mainEntity": {
        "@type": "ItemList",
        "name": `${categoryName} Articles`
      }
    }
  };
};

/**
 * Generate SEO metadata for blog tag pages
 * @param {string} tag - Blog tag
 * @param {string} baseUrl - Base URL for the application
 * @returns {Object} SEO metadata for blog tag
 */
const generateBlogTagSEOMetadata = (tag, baseUrl = 'http://localhost:5000') => {
  const title = `${tag} Blog Posts | Multi-Vendor Ecommerce`;
  const description = `Discover blog posts tagged with "${tag}". Explore related articles and insights.`;
  
  return {
    title,
    description,
    keywords: `blog, ${tag}, articles, tagged posts, insights`,
    canonicalUrl: `${baseUrl}/blog/tag/${tag.toLowerCase()}`,
    ogTitle: title,
    ogDescription: description,
    ogImage: `${baseUrl}/images/tag-${tag.toLowerCase()}-og.jpg`,
    ogUrl: `${baseUrl}/blog/tag/${tag.toLowerCase()}`,
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: `${baseUrl}/images/tag-${tag.toLowerCase()}-og.jpg`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": `${tag} Blog Posts`,
      "description": description,
      "url": `${baseUrl}/blog/tag/${tag.toLowerCase()}`,
      "mainEntity": {
        "@type": "ItemList",
        "name": `Articles tagged with ${tag}`
      }
    }
  };
};

/**
 * Generate comprehensive SEO metadata for career postings
 * @param {Object} career - Career document or plain object
 * @param {string} baseUrl - Base URL for the application
 * @returns {Object} Complete SEO metadata object
 */
const generateCareerSEOMetadata = (career, baseUrl = 'http://localhost:3000') => {
  if (!career) {
    return getDefaultCareerSEOMetadata(baseUrl);
  }

  if (typeof career.generateSEOMetadata === 'function') {
    return career.generateSEOMetadata(baseUrl);
  }

  const doc = career instanceof Career ? career : new Career(career);
  return doc.generateSEOMetadata(baseUrl);
};

/**
 * Default SEO metadata for career pages (detail fallback)
 * @param {string} baseUrl - Base URL for the application
 * @returns {Object} Default career SEO metadata
 */
const getDefaultCareerSEOMetadata = (baseUrl = 'http://localhost:3000') => {
  return {
    title: 'Careers | Anbazar',
    description: 'Explore career opportunities at Anbazar',
    keywords: 'careers, jobs, employment, Anbazar',
    canonicalUrl: `${baseUrl}/careers`,
    ogTitle: 'Careers | Anbazar',
    ogDescription: 'Explore career opportunities at Anbazar',
    ogUrl: `${baseUrl}/careers`,
    twitterTitle: 'Careers | Anbazar',
    twitterDescription: 'Explore career opportunities at Anbazar',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Careers at Anbazar',
      description: 'Explore career opportunities at Anbazar',
      url: `${baseUrl}/careers`,
    },
  };
};

/**
 * Get default SEO metadata for error pages or fallback
 * @param {string} baseUrl - Base URL for the application
 * @returns {Object} Default SEO metadata
 */
const getDefaultSEOMetadata = (baseUrl = 'http://localhost:5000') => {
  return {
    title: 'Blog Post | Multi-Vendor Ecommerce',
    description: 'Read this blog post on our platform',
    keywords: 'blog, article, news',
    canonicalUrl: `${baseUrl}/blog`,
    ogTitle: 'Blog Post | Multi-Vendor Ecommerce',
    ogDescription: 'Read this blog post on our platform',
    ogImage: `${baseUrl}/images/default-blog.jpg`,
    ogUrl: `${baseUrl}/blog`,
    twitterTitle: 'Blog Post | Multi-Vendor Ecommerce',
    twitterDescription: 'Read this blog post on our platform',
    twitterImage: `${baseUrl}/images/default-blog.jpg`,
    author: 'Blog Author',
    publishedTime: new Date(),
    modifiedTime: new Date(),
    structuredData: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": "Blog Post",
      "description": "Read this blog post on our platform",
      "url": `${baseUrl}/blog`
    }
  };
};

/**
 * Validate SEO metadata fields
 * @param {Object} seoData - SEO metadata object
 * @returns {Object} Validation result with errors array
 */
const validateSEOMetadata = (seoData) => {
  const errors = [];

  if (seoData.metaDescription && seoData.metaDescription.length > 160) {
    errors.push('Meta description should be 160 characters or less');
  }

  if (seoData.ogTitle && seoData.ogTitle.length > 60) {
    errors.push('Open Graph title should be 60 characters or less');
  }

  if (seoData.ogDescription && seoData.ogDescription.length > 160) {
    errors.push('Open Graph description should be 160 characters or less');
  }

  if (seoData.twitterTitle && seoData.twitterTitle.length > 70) {
    errors.push('Twitter title should be 70 characters or less');
  }

  if (seoData.twitterDescription && seoData.twitterDescription.length > 200) {
    errors.push('Twitter description should be 200 characters or less');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Sanitize HTML content for SEO metadata
 * @param {string} htmlContent - HTML content to sanitize
 * @param {number} maxLength - Maximum length for the sanitized content
 * @returns {string} Sanitized content
 */
const sanitizeHTMLForSEO = (htmlContent, maxLength = 160) => {
  if (!htmlContent) return '';
  
  // Remove HTML tags
  const textContent = htmlContent.replace(/<[^>]*>/g, '');
  
  // Remove extra whitespace and normalize
  const normalizedContent = textContent.replace(/\s+/g, ' ').trim();
  
  // Truncate to max length
  return normalizedContent.length > maxLength 
    ? normalizedContent.substring(0, maxLength - 3) + '...'
    : normalizedContent;
};

module.exports = {
  generateBlogSEOMetadata,
  generateBlogListingSEOMetadata,
  generateBlogCategorySEOMetadata,
  generateBlogTagSEOMetadata,
  generateCareerSEOMetadata,
  getDefaultCareerSEOMetadata,
  getDefaultSEOMetadata,
  validateSEOMetadata,
  sanitizeHTMLForSEO
};
