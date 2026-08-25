// backend/tests/utils/blogSearch.test.js
const {
  searchBlogs,
  getPopularTags,
  getCategoriesWithCounts,
  getRelatedBlogs,
  getBlogStatistics,
  getSearchSuggestions
} = require('../../utils/blogSearch');
const Blog = require('../../models/Blog');
const BlogCategory = require('../../models/BlogCategory');

// Mock the models
jest.mock('../../models/Blog');
jest.mock('../../models/BlogCategory');

describe('Blog Search Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('searchBlogs', () => {
    it('should search blogs with basic query', async () => {
      const mockBlogs = [
        { _id: '1', title: 'Test Blog', status: 'published' },
        { _id: '2', title: 'Another Test', status: 'published' }
      ];

      Blog.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(mockBlogs)
            })
          })
        })
      });

      Blog.countDocuments.mockResolvedValue(2);

      const result = await searchBlogs({ query: 'test' }, { page: 1, limit: 10 });

      expect(result.blogs).toEqual(mockBlogs);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(Blog.find).toHaveBeenCalledWith({
        status: 'published',
        $or: expect.arrayContaining([
          { title: expect.any(RegExp) },
          { description: expect.any(RegExp) },
          { author: expect.any(RegExp) },
          { tags: { $in: [expect.any(RegExp)] } },
          { metaKeywords: { $in: [expect.any(RegExp)] } }
        ])
      });
    });

    it('should search blogs with category filter', async () => {
      const mockBlogs = [{ _id: '1', title: 'Category Blog', status: 'published' }];

      Blog.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(mockBlogs)
            })
          })
        })
      });

      Blog.countDocuments.mockResolvedValue(1);

      const result = await searchBlogs({ category: 'categoryId123' }, { page: 1, limit: 10 });

      expect(Blog.find).toHaveBeenCalledWith({
        status: 'published',
        category: 'categoryId123'
      });
    });

    it('should search blogs with tags filter', async () => {
      const mockBlogs = [{ _id: '1', title: 'Tagged Blog', status: 'published' }];

      Blog.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(mockBlogs)
            })
          })
        })
      });

      Blog.countDocuments.mockResolvedValue(1);

      const result = await searchBlogs({ tags: ['tech', 'programming'] }, { page: 1, limit: 10 });

      expect(Blog.find).toHaveBeenCalledWith({
        status: 'published',
        tags: { $in: ['tech', 'programming'] }
      });
    });

    it('should search blogs with date range filter', async () => {
      const mockBlogs = [{ _id: '1', title: 'Date Blog', status: 'published' }];

      Blog.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(mockBlogs)
            })
          })
        })
      });

      Blog.countDocuments.mockResolvedValue(1);

      const dateFrom = '2023-01-01';
      const dateTo = '2023-12-31';

      const result = await searchBlogs({ dateFrom, dateTo }, { page: 1, limit: 10 });

      expect(Blog.find).toHaveBeenCalledWith({
        status: 'published',
        date: {
          $gte: new Date(dateFrom),
          $lte: new Date(dateTo)
        }
      });
    });

    it('should handle search errors', async () => {
      Blog.find.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(searchBlogs({ query: 'test' }, { page: 1, limit: 10 }))
        .rejects.toThrow('Failed to search blogs');
    });
  });

  describe('getPopularTags', () => {
    it('should return popular tags with counts', async () => {
      const mockTags = [
        { _id: 'tech', count: 10 },
        { _id: 'programming', count: 8 },
        { _id: 'javascript', count: 5 }
      ];

      Blog.aggregate.mockResolvedValue(mockTags);

      const result = await getPopularTags(20);

      expect(result).toEqual([
        { name: 'tech', count: 10 },
        { name: 'programming', count: 8 },
        { name: 'javascript', count: 5 }
      ]);

      expect(Blog.aggregate).toHaveBeenCalledWith([
        { $match: { status: 'published' } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]);
    });

    it('should handle getPopularTags errors', async () => {
      Blog.aggregate.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(getPopularTags(20))
        .rejects.toThrow('Failed to fetch popular tags');
    });
  });

  describe('getCategoriesWithCounts', () => {
    it('should return categories with post counts', async () => {
      const mockCategories = [
        { _id: 'cat1', name: 'Technology', count: 15 },
        { _id: 'cat2', name: 'Business', count: 10 }
      ];

      Blog.aggregate.mockResolvedValue(mockCategories);

      const result = await getCategoriesWithCounts();

      expect(result).toEqual(mockCategories);
      expect(Blog.aggregate).toHaveBeenCalledWith([
        { $match: { status: 'published' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $lookup: {
          from: 'blogcategories',
          localField: '_id',
          foreignField: '_id',
          as: 'categoryInfo'
        }},
        { $unwind: '$categoryInfo' },
        { $project: {
          _id: '$_id',
          name: '$categoryInfo.name',
          count: '$count'
        }},
        { $sort: { count: -1 } }
      ]);
    });

    it('should handle getCategoriesWithCounts errors', async () => {
      Blog.aggregate.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(getCategoriesWithCounts())
        .rejects.toThrow('Failed to fetch categories with counts');
    });
  });

  describe('getRelatedBlogs', () => {
    it('should return related blogs based on tags and category', async () => {
      const mockCurrentBlog = {
        _id: 'currentBlog',
        tags: ['tech', 'programming'],
        category: 'cat1'
      };

      const mockRelatedBlogs = [
        {
          _id: 'related1',
          title: 'Related Blog 1',
          tags: ['tech', 'javascript'],
          category: { _id: 'cat1', name: 'Technology' },
          relevanceScore: 3
        }
      ];

      Blog.findById.mockResolvedValue(mockCurrentBlog);
      Blog.aggregate.mockResolvedValue(mockRelatedBlogs);

      const result = await getRelatedBlogs('currentBlog', 5);

      expect(result).toEqual(mockRelatedBlogs);
      expect(Blog.findById).toHaveBeenCalledWith('currentBlog');
      expect(Blog.aggregate).toHaveBeenCalled();
    });

    it('should return empty array if current blog not found', async () => {
      Blog.findById.mockResolvedValue(null);

      const result = await getRelatedBlogs('nonexistent', 5);

      expect(result).toEqual([]);
    });

    it('should handle getRelatedBlogs errors', async () => {
      Blog.findById.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(getRelatedBlogs('currentBlog', 5))
        .rejects.toThrow('Failed to fetch related blogs');
    });
  });

  describe('getBlogStatistics', () => {
    it('should return blog statistics', async () => {
      const mockStats = [{
        totalBlogs: 100,
        totalUniqueTags: 25,
        totalUniqueAuthors: 15,
        averageWordCount: 500,
        oldestPost: new Date('2023-01-01'),
        newestPost: new Date('2023-12-31')
      }];

      Blog.aggregate.mockResolvedValue(mockStats);

      const result = await getBlogStatistics();

      expect(result).toEqual(mockStats[0]);
      expect(Blog.aggregate).toHaveBeenCalled();
    });

    it('should return default stats if no data', async () => {
      Blog.aggregate.mockResolvedValue([]);

      const result = await getBlogStatistics();

      expect(result).toEqual({
        totalBlogs: 0,
        totalUniqueTags: 0,
        totalUniqueAuthors: 0,
        averageWordCount: 0,
        oldestPost: null,
        newestPost: null
      });
    });

    it('should handle getBlogStatistics errors', async () => {
      Blog.aggregate.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(getBlogStatistics())
        .rejects.toThrow('Failed to fetch blog statistics');
    });
  });

  describe('getSearchSuggestions', () => {
    it('should return search suggestions for valid query', async () => {
      const mockSuggestions = {
        suggestions: {
          titles: ['Test Blog Title'],
          tags: [{ name: 'tech', count: 5 }],
          authors: [{ name: 'John Doe', count: 3 }]
        }
      };

      Blog.aggregate
        .mockResolvedValueOnce([{ title: 'Test Blog Title' }]) // Title suggestions
        .mockResolvedValueOnce([{ _id: 'tech', count: 5 }]) // Tag suggestions
        .mockResolvedValueOnce([{ _id: 'John Doe', count: 3 }]); // Author suggestions

      const result = await getSearchSuggestions('test', 10);

      expect(result).toEqual(mockSuggestions);
      expect(Blog.aggregate).toHaveBeenCalledTimes(3);
    });

    it('should return empty suggestions for short query', async () => {
      const result = await getSearchSuggestions('t', 10);

      expect(result).toEqual({ suggestions: [] });
    });

    it('should return empty suggestions for empty query', async () => {
      const result = await getSearchSuggestions('', 10);

      expect(result).toEqual({ suggestions: [] });
    });

    it('should handle getSearchSuggestions errors', async () => {
      Blog.aggregate.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(getSearchSuggestions('test', 10))
        .rejects.toThrow('Failed to fetch search suggestions');
    });
  });
});
