// backend/tests/routes/blogSearchRoutes.test.js
const request = require('supertest');
const express = require('express');
const blogRoutes = require('../../routes/blogRoutes');

// Mock the blog search utility
jest.mock('../../utils/blogSearch', () => ({
  searchBlogs: jest.fn(),
  getPopularTags: jest.fn(),
  getCategoriesWithCounts: jest.fn(),
  getRelatedBlogs: jest.fn(),
  getBlogStatistics: jest.fn(),
  getSearchSuggestions: jest.fn()
}));

const {
  searchBlogs,
  getPopularTags,
  getCategoriesWithCounts,
  getRelatedBlogs,
  getBlogStatistics,
  getSearchSuggestions
} = require('../../utils/blogSearch');

const app = express();
app.use(express.json());
app.use('/api/blogs', blogRoutes);

describe('Blog Search Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/blogs (with search and filters)', () => {
    it('should return blogs with search query', async () => {
      const mockResponse = {
        blogs: [{ _id: '1', title: 'Test Blog', status: 'published' }],
        total: 1,
        page: 1,
        pages: 1,
        filters: {
          search: 'test',
          category: null,
          tags: null,
          sort: 'date',
          order: 'desc'
        }
      };

      const response = await request(app)
        .get('/api/blogs')
        .query({ search: 'test' })
        .expect(200);

      expect(response.body.blogs).toBeDefined();
      expect(response.body.filters.search).toBe('test');
    });

    it('should return blogs with category filter', async () => {
      const response = await request(app)
        .get('/api/blogs')
        .query({ category: 'categoryId123' })
        .expect(200);

      expect(response.body.filters.category).toBe('categoryId123');
    });

    it('should return blogs with tags filter', async () => {
      const response = await request(app)
        .get('/api/blogs')
        .query({ tags: 'tech,programming' })
        .expect(200);

      expect(response.body.filters.tags).toEqual(['tech', 'programming']);
    });

    it('should return blogs with custom sorting', async () => {
      const response = await request(app)
        .get('/api/blogs')
        .query({ sort: 'title', order: 'asc' })
        .expect(200);

      expect(response.body.filters.sort).toBe('title');
      expect(response.body.filters.order).toBe('asc');
    });

    it('should handle pagination', async () => {
      const response = await request(app)
        .get('/api/blogs')
        .query({ page: 2, limit: 5 })
        .expect(200);

      expect(response.body.page).toBe(2);
    });
  });

  describe('GET /api/blogs/search', () => {
    it('should return search results for valid query', async () => {
      const response = await request(app)
        .get('/api/blogs/search')
        .query({ q: 'test query' })
        .expect(200);

      expect(response.body.searchQuery).toBe('test query');
      expect(response.body.blogs).toBeDefined();
    });

    it('should return 400 for empty search query', async () => {
      const response = await request(app)
        .get('/api/blogs/search')
        .query({ q: '' })
        .expect(400);

      expect(response.body.message).toContain('Search query is required');
    });

    it('should return 400 for missing search query', async () => {
      const response = await request(app)
        .get('/api/blogs/search')
        .expect(400);

      expect(response.body.message).toContain('Search query is required');
    });

    it('should handle pagination in search', async () => {
      const response = await request(app)
        .get('/api/blogs/search')
        .query({ q: 'test', page: 2, limit: 10 })
        .expect(200);

      expect(response.body.page).toBe(2);
    });
  });

  describe('GET /api/blogs/advanced-search', () => {
    it('should perform advanced search with multiple criteria', async () => {
      const mockResults = {
        blogs: [{ _id: '1', title: 'Advanced Search Result' }],
        total: 1,
        page: 1,
        pages: 1,
        hasNextPage: false,
        hasPrevPage: false
      };

      searchBlogs.mockResolvedValue(mockResults);

      const response = await request(app)
        .get('/api/blogs/advanced-search')
        .query({
          query: 'test',
          category: 'cat1',
          tags: 'tech,programming',
          author: 'John Doe',
          dateFrom: '2023-01-01',
          dateTo: '2023-12-31',
          sortBy: 'title',
          sortOrder: 'asc'
        })
        .expect(200);

      expect(searchBlogs).toHaveBeenCalledWith(
        {
          query: 'test',
          category: 'cat1',
          tags: ['tech', 'programming'],
          author: 'John Doe',
          dateFrom: '2023-01-01',
          dateTo: '2023-12-31'
        },
        {
          page: 1,
          limit: 15,
          sortBy: 'title',
          sortOrder: 'asc'
        }
      );

      expect(response.body).toEqual(mockResults);
    });

    it('should handle advanced search errors', async () => {
      searchBlogs.mockRejectedValue(new Error('Search failed'));

      const response = await request(app)
        .get('/api/blogs/advanced-search')
        .query({ query: 'test' })
        .expect(500);

      expect(response.body.message).toContain('Failed to perform advanced search');
    });
  });

  describe('GET /api/blogs/suggestions', () => {
    it('should return search suggestions for valid query', async () => {
      const mockSuggestions = {
        suggestions: {
          titles: ['Test Blog'],
          tags: [{ name: 'tech', count: 5 }],
          authors: [{ name: 'John Doe', count: 3 }]
        }
      };

      getSearchSuggestions.mockResolvedValue(mockSuggestions);

      const response = await request(app)
        .get('/api/blogs/suggestions')
        .query({ q: 'test' })
        .expect(200);

      expect(getSearchSuggestions).toHaveBeenCalledWith('test');
      expect(response.body).toEqual(mockSuggestions);
    });

    it('should return empty suggestions for short query', async () => {
      const response = await request(app)
        .get('/api/blogs/suggestions')
        .query({ q: 't' })
        .expect(200);

      expect(response.body.suggestions).toEqual([]);
    });

    it('should return empty suggestions for missing query', async () => {
      const response = await request(app)
        .get('/api/blogs/suggestions')
        .expect(200);

      expect(response.body.suggestions).toEqual([]);
    });

    it('should handle suggestions errors', async () => {
      getSearchSuggestions.mockRejectedValue(new Error('Suggestions failed'));

      const response = await request(app)
        .get('/api/blogs/suggestions')
        .query({ q: 'test' })
        .expect(500);

      expect(response.body.message).toContain('Failed to fetch search suggestions');
    });
  });

  describe('GET /api/blogs/related/:id', () => {
    it('should return related blogs for valid blog ID', async () => {
      const mockRelatedBlogs = [
        { _id: '1', title: 'Related Blog 1' },
        { _id: '2', title: 'Related Blog 2' }
      ];

      getRelatedBlogs.mockResolvedValue(mockRelatedBlogs);

      const response = await request(app)
        .get('/api/blogs/related/blogId123')
        .query({ limit: 5 })
        .expect(200);

      expect(getRelatedBlogs).toHaveBeenCalledWith('blogId123', 5);
      expect(response.body.relatedBlogs).toEqual(mockRelatedBlogs);
    });

    it('should use default limit if not provided', async () => {
      getRelatedBlogs.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/blogs/related/blogId123')
        .expect(200);

      expect(getRelatedBlogs).toHaveBeenCalledWith('blogId123', 5);
    });

    it('should handle related blogs errors', async () => {
      getRelatedBlogs.mockRejectedValue(new Error('Related blogs failed'));

      const response = await request(app)
        .get('/api/blogs/related/blogId123')
        .expect(500);

      expect(response.body.message).toContain('Failed to fetch related blogs');
    });
  });

  describe('GET /api/blogs/statistics', () => {
    it('should return blog statistics', async () => {
      const mockStats = {
        totalBlogs: 100,
        totalUniqueTags: 25,
        totalUniqueAuthors: 15,
        averageWordCount: 500
      };

      getBlogStatistics.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/blogs/statistics')
        .expect(200);

      expect(getBlogStatistics).toHaveBeenCalled();
      expect(response.body).toEqual(mockStats);
    });

    it('should handle statistics errors', async () => {
      getBlogStatistics.mockRejectedValue(new Error('Statistics failed'));

      const response = await request(app)
        .get('/api/blogs/statistics')
        .expect(500);

      expect(response.body.message).toContain('Failed to fetch blog statistics');
    });
  });

  describe('GET /api/blogs/category/:categoryId', () => {
    it('should return blogs by category', async () => {
      const response = await request(app)
        .get('/api/blogs/category/categoryId123')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body.categoryId).toBe('categoryId123');
      expect(response.body.blogs).toBeDefined();
    });

    it('should handle category blogs errors', async () => {
      // Mock the Blog model to throw an error
      const Blog = require('../../models/Blog');
      Blog.find.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .get('/api/blogs/category/categoryId123')
        .expect(500);

      expect(response.body.message).toContain('Failed to fetch blogs by category');
    });
  });

  describe('GET /api/blogs/tags/available', () => {
    it('should return available tags', async () => {
      const mockTags = [
        { name: 'tech', count: 10 },
        { name: 'programming', count: 8 }
      ];

      getPopularTags.mockResolvedValue(mockTags);

      const response = await request(app)
        .get('/api/blogs/tags/available')
        .query({ limit: 20 })
        .expect(200);

      expect(getPopularTags).toHaveBeenCalledWith(20);
      expect(response.body.tags).toEqual(mockTags);
    });

    it('should use default limit if not provided', async () => {
      getPopularTags.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/blogs/tags/available')
        .expect(200);

      expect(getPopularTags).toHaveBeenCalledWith(50);
    });

    it('should handle available tags errors', async () => {
      getPopularTags.mockRejectedValue(new Error('Tags failed'));

      const response = await request(app)
        .get('/api/blogs/tags/available')
        .expect(500);

      expect(response.body.message).toContain('Failed to fetch available tags');
    });
  });

  describe('GET /api/blogs/categories/available', () => {
    it('should return available categories', async () => {
      const mockCategories = [
        { _id: 'cat1', name: 'Technology', count: 15 },
        { _id: 'cat2', name: 'Business', count: 10 }
      ];

      getCategoriesWithCounts.mockResolvedValue(mockCategories);

      const response = await request(app)
        .get('/api/blogs/categories/available')
        .expect(200);

      expect(getCategoriesWithCounts).toHaveBeenCalled();
      expect(response.body.categories).toEqual(mockCategories);
    });

    it('should handle available categories errors', async () => {
      getCategoriesWithCounts.mockRejectedValue(new Error('Categories failed'));

      const response = await request(app)
        .get('/api/blogs/categories/available')
        .expect(500);

      expect(response.body.message).toContain('Failed to fetch available categories');
    });
  });
});
