// backend/utils/blogSearch.js
const Blog = require('../models/Blog');
const BlogCategory = require('../models/BlogCategory');

/**
 * Advanced blog search with multiple criteria
 * @param {Object} searchCriteria - Search criteria object
 * @param {Object} options - Search options (pagination, sorting, etc.)
 * @returns {Object} Search results with pagination info
 */
const searchBlogs = async (searchCriteria = {}, options = {}) => {
  try {
    const {
      query,
      category,
      tags,
      author,
      dateFrom,
      dateTo,
      status = 'published'
    } = searchCriteria;

    const {
      page = 1,
      limit = 15,
      sortBy = 'date',
      sortOrder = 'desc'
    } = options;

    // Build MongoDB query
    let mongoQuery = { status };

    // Text search across multiple fields
    if (query && query.trim()) {
      const searchRegex = new RegExp(query.trim(), 'i');
      mongoQuery.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { author: searchRegex },
        { tags: { $in: [searchRegex] } },
        { metaKeywords: { $in: [searchRegex] } }
      ];
    }

    // Category filter
    if (category) {
      mongoQuery.categories = category;
    }

    // Tags filter
    if (tags && Array.isArray(tags) && tags.length > 0) {
      mongoQuery.tags = { $in: tags.map(tag => tag.toLowerCase().trim()) };
    }

    // Author filter
    if (author) {
      mongoQuery.author = new RegExp(author, 'i');
    }

    // Date range filter
    if (dateFrom || dateTo) {
      mongoQuery.date = {};
      if (dateFrom) {
        mongoQuery.date.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        mongoQuery.date.$lte = new Date(dateTo);
      }
    }

    // Build sort object
    let sortObj = {};
    switch (sortBy) {
      case 'title':
        sortObj.title = sortOrder === 'asc' ? 1 : -1;
        break;
      case 'author':
        sortObj.author = sortOrder === 'asc' ? 1 : -1;
        break;
      case 'date':
      default:
        sortObj.date = sortOrder === 'asc' ? 1 : -1;
        break;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute search
    const [blogs, total] = await Promise.all([
      Blog.find(mongoQuery)
        .populate('categories', 'name')
        .sort(sortObj)
        .skip(skip)
        .limit(limit),
      Blog.countDocuments(mongoQuery)
    ]);

    return {
      blogs,
      total,
      page,
      pages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
      searchCriteria,
      options
    };
  } catch (error) {
    console.error('❌ Blog search error:', error);
    throw new Error('Failed to search blogs');
  }
};

/**
 * Get popular tags with usage count
 * @param {number} limit - Maximum number of tags to return
 * @returns {Array} Array of popular tags with counts
 */
const getPopularTags = async (limit = 20) => {
  try {
    const tags = await Blog.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);

    return tags.map(tag => ({
      name: tag._id,
      count: tag.count
    }));
  } catch (error) {
    console.error('❌ Popular tags error:', error);
    throw new Error('Failed to fetch popular tags');
  }
};

/**
 * Get blog categories with post counts (includes all categories, count 0 when none)
 * @returns {Array} Array of { _id, name, count } sorted by count desc then name
 */
const getCategoriesWithCounts = async () => {
  try {
    const [countsFromBlogs, allCategories] = await Promise.all([
      Blog.aggregate([
        { $match: { status: 'published' } },
        { $unwind: '$categories' },
        { $group: { _id: '$categories', count: { $sum: 1 } } }
      ]),
      BlogCategory.find().select('_id name').lean()
    ]);

    const countMap = new Map(
      countsFromBlogs.map((c) => [c._id.toString(), c.count])
    );

    const categories = allCategories.map((cat) => ({
      _id: cat._id,
      name: cat.name,
      count: countMap.get(cat._id.toString()) ?? 0
    }));

    categories.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return (a.name || '').localeCompare(b.name || '');
    });

    return categories;
  } catch (error) {
    console.error('❌ Categories with counts error:', error);
    throw new Error('Failed to fetch categories with counts');
  }
};

/**
 * Get related blogs based on tags and category
 * @param {string} blogId - Current blog ID
 * @param {number} limit - Maximum number of related blogs
 * @returns {Array} Array of related blogs
 */
const getRelatedBlogs = async (blogId, limit = 5) => {
  try {
    const currentBlog = await Blog.findById(blogId);
    if (!currentBlog) {
      return [];
    }

    const relatedBlogs = await Blog.aggregate([
      {
        $match: {
          _id: { $ne: currentBlog._id },
          status: 'published'
        }
      },
      {
        $addFields: {
          tagMatches: {
            $size: {
              $setIntersection: ['$tags', currentBlog.tags]
            }
          },
          categoryMatch: {
            $size: {
              $setIntersection: ['$categories', currentBlog.categories]
            }
          }
        }
      },
      {
        $addFields: {
          relevanceScore: {
            $add: [
              { $multiply: ['$tagMatches', 2] },
              { $multiply: ['$categoryMatch', 1.5] } // Weighted category match
            ]
          }
        }
      },
      { $match: { relevanceScore: { $gt: 0 } } },
      { $sort: { relevanceScore: -1, date: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'blogcategories',
          localField: 'categories',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      {
        $project: {
          title: 1,
          description: 1,
          image: 1,
          date: 1,
          author: 1,
          tags: 1,
          slug: 1,
          categories: {
            $map: {
              input: '$categoryInfo',
              as: 'cat',
              in: { _id: '$$cat._id', name: '$$cat.name' }
            }
          },
          relevanceScore: 1
        }
      }
    ]);

    return relatedBlogs;
  } catch (error) {
    console.error('❌ Related blogs error:', error);
    throw new Error('Failed to fetch related blogs');
  }
};

/**
 * Get blog statistics for analytics
 * @returns {Object} Blog statistics
 */
const getBlogStatistics = async () => {
  try {
    const stats = await Blog.aggregate([
      { $match: { status: 'published' } },
      {
        $group: {
          _id: null,
          totalBlogs: { $sum: 1 },
          totalTags: { $addToSet: '$tags' },
          totalAuthors: { $addToSet: '$author' },
          averageWordCount: { $avg: { $strLenCP: '$description' } },
          oldestPost: { $min: '$date' },
          newestPost: { $max: '$date' }
        }
      },
      {
        $project: {
          _id: 0,
          totalBlogs: 1,
          totalUniqueTags: {
            $size: {
              $reduce: {
                input: '$totalTags',
                initialValue: [],
                in: { $setUnion: ['$$value', '$$this'] }
              }
            }
          },
          totalUniqueAuthors: { $size: '$totalAuthors' },
          averageWordCount: { $round: ['$averageWordCount', 0] },
          oldestPost: 1,
          newestPost: 1
        }
      }
    ]);

    return stats[0] || {
      totalBlogs: 0,
      totalUniqueTags: 0,
      totalUniqueAuthors: 0,
      averageWordCount: 0,
      oldestPost: null,
      newestPost: null
    };
  } catch (error) {
    console.error('❌ Blog statistics error:', error);
    throw new Error('Failed to fetch blog statistics');
  }
};

/**
 * Search suggestions based on partial query
 * @param {string} query - Partial search query
 * @param {number} limit - Maximum number of suggestions
 * @returns {Object} Search suggestions
 */
const getSearchSuggestions = async (query, limit = 10) => {
  try {
    if (!query || query.trim().length < 2) {
      return { suggestions: [] };
    }

    const searchRegex = new RegExp(query.trim(), 'i');

    const [titleSuggestions, tagSuggestions, authorSuggestions] = await Promise.all([
      // Title suggestions
      Blog.aggregate([
        {
          $match: {
            status: 'published',
            title: searchRegex
          }
        },
        { $project: { title: 1 } },
        { $limit: limit }
      ]),

      // Tag suggestions
      Blog.aggregate([
        {
          $match: {
            status: 'published',
            tags: { $in: [searchRegex] }
          }
        },
        { $unwind: '$tags' },
        { $match: { tags: searchRegex } },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit }
      ]),

      // Author suggestions
      Blog.aggregate([
        {
          $match: {
            status: 'published',
            author: searchRegex
          }
        },
        { $group: { _id: '$author', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit }
      ])
    ]);

    return {
      suggestions: {
        titles: titleSuggestions.map(item => item.title),
        tags: tagSuggestions.map(item => ({ name: item._id, count: item.count })),
        authors: authorSuggestions.map(item => ({ name: item._id, count: item.count }))
      }
    };
  } catch (error) {
    console.error('❌ Search suggestions error:', error);
    throw new Error('Failed to fetch search suggestions');
  }
};

module.exports = {
  searchBlogs,
  getPopularTags,
  getCategoriesWithCounts,
  getRelatedBlogs,
  getBlogStatistics,
  getSearchSuggestions
};
