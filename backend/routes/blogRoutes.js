const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Blog = require("../models/Blog");
const { withAdminAuth } = require("../utils/adminAuthChain");
const contentView = withAdminAuth("content", "view");
const contentManage = withAdminAuth("content", "manage");
const { applyTranslations } = require("../utils/applyTranslations");
const { r2Uploads, handleUploadError } = require("../middleware/secureUpload");
const {
  generateBlogSEOMetadata,
  generateBlogListingSEOMetadata,
  generateBlogCategorySEOMetadata,
  generateBlogTagSEOMetadata,
  validateSEOMetadata
} = require("../utils/seoMetadata");
const {
  searchBlogs,
  getPopularTags,
  getCategoriesWithCounts,
  getRelatedBlogs,
  getBlogStatistics,
  getSearchSuggestions
} = require("../utils/blogSearch");
const { validateBlog } = require("../middleware/validation");

/* -------------------------------------------------------------------------- */
/*                         🏢 ADMIN DRAFT ROUTES                              */
/* -------------------------------------------------------------------------- */

// GET → /api/blogs/admin/latest-draft
router.get("/admin/latest-draft", ...contentView, async (req, res) => {
  try {
    const draft = await Blog.findOne({
      ownerUserId: req.user._id,
      status: "draft"
    }).sort({ updatedAt: -1 }).populate("categories", "name");

    res.json({ draft });
  } catch (err) {
    console.error("❌ Latest draft fetch error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch latest draft" });
  }
});

// POST → /api/blogs/admin/auto-save
router.post("/admin/auto-save", ...contentManage, async (req, res) => {
  try {
    const { id, ...updateData } = req.body;

    // Ensure status is draft for auto-save
    updateData.status = "draft";
    updateData.ownerUserId = req.user._id;

    // Cleanse updateData for auto-save
    if (updateData.categories === "") delete updateData.categories;
    if (updateData.category) delete updateData.category; // Legacy cleanup
    if (updateData.image && typeof updateData.image === 'object' && Object.keys(updateData.image).length === 0) {
      delete updateData.image;
    }

    let blog;
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      // Update existing draft
      blog = await Blog.findOneAndUpdate(
        { _id: id, ownerUserId: req.user._id, status: "draft" },
        updateData,
        { new: true, upsert: false }
      );
    }

    if (!blog) {
      // Create new draft if no ID or if ID not found/not a draft
      // Ensure basic requirements for initial draft creation
      if (!updateData.title) updateData.title = "Untitled Draft";
      if (!updateData.description) updateData.description = "Draft content...";

      blog = new Blog(updateData);
      await blog.save();
    }

    res.json({ message: "✅ Draft auto-saved", blog });
  } catch (err) {
    console.error("❌ Auto-save error:", err.message);
    res.status(500).json({ message: "❌ Failed to auto-save draft" });
  }
});


/* -------------------------------------------------------------------------- */
/*                         📖 PUBLIC ROUTES (No Auth)                         */
/* -------------------------------------------------------------------------- */

// GET → /api/blogs?page=1&limit=15&search=keyword&category=id&tags=tag1,tag2&sort=date&order=desc
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;
    const { search, category, tags, sort = 'date', order = 'desc' } = req.query;

    // Build query object
    let query = { status: "published" };

    // Search functionality
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { author: searchRegex },
        { tags: { $in: [searchRegex] } }
      ];
    }

    // Category filtering (supports multi-category schema)
    if (category) {
      query.categories = category;
    }

    // Tags filtering
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase());
      query.tags = { $in: tagArray };
    }

    // Build sort object
    let sortObj = {};
    if (sort === 'date') {
      sortObj.date = order === 'asc' ? 1 : -1;
    } else if (sort === 'title') {
      sortObj.title = order === 'asc' ? 1 : -1;
    } else if (sort === 'author') {
      sortObj.author = order === 'asc' ? 1 : -1;
    } else {
      sortObj.date = -1; // Default sort
    }

    const [blogsRaw, total] = await Promise.all([
      Blog.find(query)
        .populate("categories", "name")
        .populate("imageId", "alt_text") // ✅ ALT Priority support
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),

      Blog.countDocuments(query),
    ]);
    let blogs = blogsRaw;
    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      blogs = await applyTranslations(blogs, 'Blog', locale, ['title', 'description', 'intro']);
    }

    res.json({
      blogs,
      total,
      page,
      pages: Math.ceil(total / limit),
      filters: {
        search: search || null,
        category: category || null,
        tags: tags ? tags.split(',').map(tag => tag.trim()) : null,
        sort,
        order
      }
    });
  } catch (err) {
    console.error("❌ Blog fetch error:", err);
    res.status(500).json({ message: "❌ Failed to load blogs" });
  }
});

// GET → /api/blogs/search?q=keyword&page=1&limit=15
router.get("/search", async (req, res) => {
  try {
    const { q: searchQuery, page = 1, limit = 15 } = req.query;

    if (!searchQuery || searchQuery.trim() === '') {
      return res.status(400).json({ message: "❌ Search query is required" });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Advanced search with multiple fields
    const searchRegex = new RegExp(searchQuery.trim(), 'i');
    const query = {
      status: "published",
      $or: [
        { title: searchRegex },
        { description: searchRegex },
        { author: searchRegex },
        { tags: { $in: [searchRegex] } },
        { metaKeywords: { $in: [searchRegex] } }
      ]
    };

    const [blogsRaw, total] = await Promise.all([
      Blog.find(query)
        .populate("categories", "name")
        .sort({ date: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Blog.countDocuments(query),
    ]);
    let blogs = blogsRaw;
    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      blogs = await applyTranslations(blogs, 'Blog', locale, ['title', 'description', 'intro']);
    }
    res.json({
      blogs,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      searchQuery: searchQuery.trim(),
      results: total
    });
  } catch (err) {
    console.error("❌ Blog search error:", err.message);
    res.status(500).json({ message: "❌ Failed to search blogs" });
  }
});

// GET → /api/blogs/advanced-search
router.get("/advanced-search", async (req, res) => {
  try {
    const {
      query,
      category,
      tags,
      author,
      dateFrom,
      dateTo,
      page = 1,
      limit = 15,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    const searchCriteria = {
      query,
      category,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : undefined,
      author,
      dateFrom,
      dateTo
    };

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder
    };

    const results = await searchBlogs(searchCriteria, options);
    const locale = req.query.locale;
    if (locale && locale !== 'en' && results.blogs && results.blogs.length > 0) {
      const leanBlogs = results.blogs.map((b) => (b && b.toObject ? b.toObject() : b));
      results.blogs = await applyTranslations(leanBlogs, 'Blog', locale, ['title', 'description', 'intro']);
    }
    res.json(results);
  } catch (err) {
    console.error("❌ Advanced search error:", err.message);
    res.status(500).json({ message: "❌ Failed to perform advanced search" });
  }
});

// GET → /api/blogs/suggestions?q=partial
router.get("/suggestions", async (req, res) => {
  try {
    const { q: query } = req.query;

    if (!query || query.trim().length < 2) {
      return res.json({ suggestions: [] });
    }

    const suggestions = await getSearchSuggestions(query.trim());
    res.json(suggestions);
  } catch (err) {
    console.error("❌ Search suggestions error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch search suggestions" });
  }
});

// GET → /api/blogs/related/:id
router.get("/related/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 5;

    let relatedBlogs = await getRelatedBlogs(id, limit);
    const locale = req.query.locale;
    if (locale && locale !== 'en' && Array.isArray(relatedBlogs) && relatedBlogs.length > 0) {
      const lean = relatedBlogs.map((b) => (b && b.toObject ? b.toObject() : b));
      relatedBlogs = await applyTranslations(lean, 'Blog', locale, ['title', 'description', 'intro']);
    }
    res.json({ relatedBlogs });
  } catch (err) {
    console.error("❌ Related blogs error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch related blogs" });
  }
});

// GET → /api/blogs/statistics
router.get("/statistics", async (req, res) => {
  try {
    const statistics = await getBlogStatistics();
    res.json(statistics);
  } catch (err) {
    console.error("❌ Blog statistics error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch blog statistics" });
  }
});

// GET → /api/blogs/category/:categoryId?page=1&limit=15
router.get("/category/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const query = {
      status: "published",
      categories: categoryId
    };

    const [blogsRaw, total] = await Promise.all([
      Blog.find(query)
        .populate("categories", "name")
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Blog.countDocuments(query),
    ]);
    let blogs = blogsRaw;
    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      blogs = await applyTranslations(blogs, 'Blog', locale, ['title', 'description', 'intro']);
    }
    res.json({
      blogs,
      total,
      page,
      pages: Math.ceil(total / limit),
      categoryId
    });
  } catch (err) {
    console.error("❌ Blog by category error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch blogs by category" });
  }
});

// GET → /api/blogs/tags/available
router.get("/tags/available", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const popularTags = await getPopularTags(limit);
    res.json({ tags: popularTags });
  } catch (err) {
    console.error("❌ Available tags error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch available tags" });
  }
});

// GET → /api/blogs/categories/available
router.get("/categories/available", async (req, res) => {
  try {
    const categories = await getCategoriesWithCounts();
    res.json({ categories });
  } catch (err) {
    console.error("❌ Available categories error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch available categories" });
  }
});

// GET → /api/blogs/tag/:tag (Public)
router.get("/tag/:tag", async (req, res) => {
  try {
    const searchTag = req.params.tag.toLowerCase().trim(); // Normalize search tag
    let blogs = await Blog.find({ tags: searchTag, status: "published" }) // Direct match in array
      .populate("categories", "name")
      .sort({ date: -1 })
      .lean();
    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      blogs = await applyTranslations(blogs, 'Blog', locale, ['title', 'description', 'intro']);
    }
    res.json({ blogs });
  } catch (err) {
    console.error("❌ Blog by tag error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch blogs by tag" });
  }
});

// GET → /api/blogs/:id
router.get("/:id", async (req, res) => {
  try {
    let blog = await Blog.findById(req.params.id).populate("categories", "name").lean();
    if (!blog) return res.status(404).json({ message: "❌ Blog not found" });

    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      blog = await applyTranslations(blog, 'Blog', locale, ['title', 'description', 'intro']);
    }

    // Generate SEO metadata (reconstruct minimal doc for method if needed)
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const tempBlog = new Blog(blog);
    const seoMetadata = tempBlog.generateSEOMetadata(baseUrl);

    if (!blog.date || blog.date === 'undefined') {
      blog.date = blog.createdAt || new Date();
    }

    res.json({
      ...blog,
      seoMetadata
    });
  } catch (err) {
    console.error("❌ Blog by ID error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch blog" });
  }
});

// GET → /api/blogs/slug/:slug
router.get("/slug/:slug", async (req, res) => {
  try {
    let blog = await Blog.findOne({
      slug: req.params.slug,
      status: "published",
    }).populate("categories", "name").lean();

    if (!blog) return res.status(404).json({ message: "❌ Blog not found" });

    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      blog = await applyTranslations(blog, 'Blog', locale, ['title', 'description', 'intro']);
    }

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const tempBlog = new Blog(blog);
    const seoMetadata = tempBlog.generateSEOMetadata(baseUrl);

    if (!blog.date || blog.date === 'undefined') {
      blog.date = blog.createdAt || new Date();
    }

    res.json({
      ...blog,
      seoMetadata
    });
  } catch (err) {
    console.error("❌ Blog by slug error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch blog" });
  }
});

/* -------------------------------------------------------------------------- */
/*                         💝 ENGAGEMENT ROUTES (Public)                      */
/* -------------------------------------------------------------------------- */

// POST → /api/blogs/:id/like
router.post("/:id/like", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body; // Optional user ID for tracking

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ message: "❌ Blog not found" });
    }

    if (blog.status !== 'published') {
      return res.status(400).json({ message: "❌ Cannot like unpublished blog" });
    }

    await blog.like(userId);

    // Get updated engagement status
    const userEngagement = blog.hasUserEngaged(userId);

    res.json({
      message: "✅ Blog liked",
      likes: blog.likes,
      dislikes: blog.dislikes,
      userEngagement
    });
  } catch (err) {
    console.error("❌ Like blog error:", err.message);
    res.status(500).json({ message: "❌ Failed to like blog" });
  }
});

// POST → /api/blogs/:id/dislike
router.post("/:id/dislike", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body; // Optional user ID for tracking

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ message: "❌ Blog not found" });
    }

    if (blog.status !== 'published') {
      return res.status(400).json({ message: "❌ Cannot dislike unpublished blog" });
    }

    await blog.dislike(userId);

    // Get updated engagement status
    const userEngagement = blog.hasUserEngaged(userId);

    res.json({
      message: "✅ Blog disliked",
      likes: blog.likes,
      dislikes: blog.dislikes,
      userEngagement
    });
  } catch (err) {
    console.error("❌ Dislike blog error:", err.message);
    res.status(500).json({ message: "❌ Failed to dislike blog" });
  }
});

// DELETE → /api/blogs/:id/unlike
router.delete("/:id/unlike", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body; // Optional user ID for tracking

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ message: "❌ Blog not found" });
    }

    if (blog.status !== 'published') {
      return res.status(400).json({ message: "❌ Cannot unlike unpublished blog" });
    }

    await blog.removeLike(userId);

    // Get updated engagement status
    const userEngagement = blog.hasUserEngaged(userId);

    res.json({
      message: "✅ Like removed",
      likes: blog.likes,
      dislikes: blog.dislikes,
      userEngagement
    });
  } catch (err) {
    console.error("❌ Unlike blog error:", err.message);
    res.status(500).json({ message: "❌ Failed to remove like" });
  }
});

// DELETE → /api/blogs/:id/undislike
router.delete("/:id/undislike", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body; // Optional user ID for tracking

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ message: "❌ Blog not found" });
    }

    if (blog.status !== 'published') {
      return res.status(400).json({ message: "❌ Cannot undislike unpublished blog" });
    }

    await blog.removeDislike(userId);

    // Get updated engagement status
    const userEngagement = blog.hasUserEngaged(userId);

    res.json({
      message: "✅ Dislike removed",
      likes: blog.likes,
      dislikes: blog.dislikes,
      userEngagement
    });
  } catch (err) {
    console.error("❌ Undislike blog error:", err.message);
    res.status(500).json({ message: "❌ Failed to remove dislike" });
  }
});

// GET → /api/blogs/:id/engagement-status
router.get("/:id/engagement-status", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query; // Optional user ID for tracking

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ message: "❌ Blog not found" });
    }

    if (blog.status !== 'published') {
      return res.status(400).json({ message: "❌ Cannot get engagement status for unpublished blog" });
    }

    const userEngagement = blog.hasUserEngaged(userId);

    res.json({
      likes: blog.likes,
      dislikes: blog.dislikes,
      views: blog.views,
      shares: blog.shares,
      userEngagement
    });
  } catch (err) {
    console.error("❌ Get engagement status error:", err.message);
    res.status(500).json({ message: "❌ Failed to get engagement status" });
  }
});

// POST → /api/blogs/:id/view
router.post("/:id/view", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body; // Optional user ID for tracking

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ message: "❌ Blog not found" });
    }

    if (blog.status !== 'published') {
      return res.status(400).json({ message: "❌ Cannot view unpublished blog" });
    }

    // Basic rate limiting: Check if user has viewed recently (within 5 minutes)
    // This prevents rapid view inflation from the same user
    const viewKey = `view_${id}_${userId || req.ip}`;
    const lastView = req.app.locals.viewCache || {};
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (lastView[viewKey] && (now - lastView[viewKey]) < fiveMinutes) {
      // User has viewed recently, return current view count without incrementing
      return res.json({
        message: "✅ View already recorded recently",
        views: blog.views
      });
    }

    // Record the view
    await blog.incrementViews();

    // Cache the view timestamp
    if (!req.app.locals.viewCache) {
      req.app.locals.viewCache = {};
    }
    req.app.locals.viewCache[viewKey] = now;

    res.json({
      message: "✅ View recorded",
      views: blog.views
    });
  } catch (err) {
    console.error("❌ View blog error:", err.message);
    res.status(500).json({ message: "❌ Failed to record view" });
  }
});

// POST → /api/blogs/:id/share
router.post("/:id/share", async (req, res) => {
  try {
    const { id } = req.params;
    const { platform } = req.body; // Optional platform tracking

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ message: "❌ Blog not found" });
    }

    if (blog.status !== 'published') {
      return res.status(400).json({ message: "❌ Cannot share unpublished blog" });
    }

    await blog.incrementShares();

    res.json({
      message: "✅ Share recorded",
      shares: blog.shares,
      platform: platform || 'unknown'
    });
  } catch (err) {
    console.error("❌ Share blog error:", err.message);
    res.status(500).json({ message: "❌ Failed to record share" });
  }
});

// GET → /api/blogs/engagement/most-liked
router.get("/engagement/most-liked", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const mostLiked = await Blog.getMostLiked(limit);

    res.json({ blogs: mostLiked });
  } catch (err) {
    console.error("❌ Most liked blogs error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch most liked blogs" });
  }
});

// GET → /api/blogs/engagement/most-viewed
router.get("/engagement/most-viewed", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const mostViewed = await Blog.getMostViewed(limit);

    res.json({ blogs: mostViewed });
  } catch (err) {
    console.error("❌ Most viewed blogs error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch most viewed blogs" });
  }
});

// GET → /api/blogs/engagement/most-shared
router.get("/engagement/most-shared", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const mostShared = await Blog.getMostShared(limit);

    res.json({ blogs: mostShared });
  } catch (err) {
    console.error("❌ Most shared blogs error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch most shared blogs" });
  }
});

// GET → /api/blogs/engagement/stats
router.get("/engagement/stats", async (req, res) => {
  try {
    const stats = await Blog.getEngagementStats();
    const result = stats.length > 0 ? stats[0] : {
      totalLikes: 0,
      totalDislikes: 0,
      totalViews: 0,
      totalShares: 0,
      averageLikes: 0,
      averageViews: 0,
      blogCount: 0
    };

    res.json({ stats: result });
  } catch (err) {
    console.error("❌ Engagement stats error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch engagement statistics" });
  }
});

/* -------------------------------------------------------------------------- */
/*                         🔐 ADMIN ROUTES (With Auth)                        */
/* -------------------------------------------------------------------------- */

// POST → /api/blogs/admin/add-blog
router.post(
  "/admin/add-blog",
  ...contentManage,
  r2Uploads.blogImage(),
  handleUploadError,
  validateBlog,
  async (req, res) => {
    try {
      const {
        title,
        description,
        date,
        author,
        tags,
        status,
        categories, // Expecting array of IDs
        // SEO metadata fields
        metaTitle,
        intro,
        keyword,
        metaDescription,
        metaKeywords,
        canonicalUrl,
        ogTitle,
        ogDescription,
        twitterTitle,
        twitterDescription
      } = req.body;
      const image = req.file ? req.file.filename : (typeof req.body.image === 'string' ? req.body.image : null);

      // Handle category backward compatibility
      let categoryIds = [];
      if (categories) {
        if (Array.isArray(categories)) {
          categoryIds = categories;
        } else if (typeof categories === 'string') {
          categoryIds = categories.split(',').filter(id => id.trim() !== '');
        }
      } else if (req.body.category) {
        categoryIds = [req.body.category];
      }

      const blog = new Blog({
        title,
        description,
        date: date || new Date(), // Ensure we always have a date
        author: author || "Admin",
        categories: categoryIds,
        category: categoryIds.length > 0 ? categoryIds[0] : undefined, // Legacy support
        tags: tags?.split(",").map((tag) => tag.trim()),
        status,
        ownerUserId: req.user._id, // ✅ Fixed: User-scoped ownership
        image: image || undefined,
        // SEO & Schema fields
        metaTitle,
        intro,
        keyword,
        metaDescription,
        metaKeywords: metaKeywords ? metaKeywords.split(",").map((keyword) => keyword.trim()) : [],
        canonicalUrl,
        ogTitle,
        ogDescription,
        twitterTitle,
        twitterDescription
      });

      await blog.save();

      // Generate SEO metadata for response
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const seoMetadata = blog.generateSEOMetadata(baseUrl);

      res.status(201).json({
        message: "✅ Blog added",
        blog: {
          ...blog.toObject(),
          seoMetadata
        }
      });
    } catch (err) {
      console.error("❌ Blog add error:", err.message);
      res.status(500).json({ message: "❌ Failed to add blog" });
    }
  }
);

// PUT → /api/blogs/admin/edit-blog/:id
router.put(
  "/admin/edit-blog/:id",
  ...contentManage,
  r2Uploads.blogImage(),
  handleUploadError,
  validateBlog,
  async (req, res) => {
    try {
      const {
        title,
        description,
        date,
        author,
        tags,
        status,
        categories,
        // SEO metadata fields
        metaTitle,
        intro,
        keyword,
        slug, // Allow manual slug update
        metaDescription,
        metaKeywords,
        canonicalUrl,
        ogTitle,
        ogDescription,
        twitterTitle,
        twitterDescription
      } = req.body;

      // Handle category backward compatibility
      let categoryIds = [];
      if (categories) {
        if (Array.isArray(categories)) {
          categoryIds = categories;
        } else if (typeof categories === 'string') {
          categoryIds = categories.split(',').filter(id => id.trim() !== '');
        }
      } else if (req.body.category) {
        categoryIds = [req.body.category];
      }

      const updateData = {
        title,
        description,
        date,
        author,
        status,
        categories: categoryIds,
        category: categoryIds.length > 0 ? categoryIds[0] : undefined, // Legacy support
        tags: tags?.split(",").map((tag) => tag.trim()),
        // SEO metadata
        metaTitle,
        intro,
        keyword,
        slug,
        metaDescription,
        metaKeywords: metaKeywords ? metaKeywords.split(",").map((keyword) => keyword.trim()) : [],
        canonicalUrl,
        ogTitle,
        ogDescription,
        twitterTitle,
        twitterDescription
      };

      if (req.file) {
        updateData.image = req.file.filename;
      } else if (req.body.image && typeof req.body.image === 'string') {
        updateData.image = req.body.image;
      }


      const updated = await Blog.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
      }).populate("categories", "name");

      if (!updated) {
        return res.status(404).json({ message: "❌ Blog not found" });
      }

      // Generate SEO metadata for response
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const seoMetadata = updated.generateSEOMetadata(baseUrl);

      res.json({
        message: "✅ Blog updated",
        blog: {
          ...updated.toObject(),
          seoMetadata
        }
      });
    } catch (err) {
      console.error("❌ Blog update error:", err.message);
      res.status(500).json({ message: "❌ Failed to update blog" });
    }
  }
);

// PUT → /api/blogs/admin/trash/:id (Manual move to trash)
router.put("/admin/trash/:id", ...contentManage, async (req, res) => {
  try {
    const blog = await Blog.findOneAndUpdate(
      { _id: req.params.id, ownerUserId: req.user._id },
      { status: "trash" },
      { new: true }
    );
    if (!blog) return res.status(404).json({ message: "❌ Blog not found" });
    res.json({ message: "✅ Blog moved to trash", blog });
  } catch (err) {
    console.error("❌ Trash error:", err.message);
    res.status(500).json({ message: "❌ Failed to move blog to trash" });
  }
});

// DELETE → /api/blogs/admin/delete/:id (Now moves to trash by default)
router.delete("/admin/delete/:id", ...contentManage, async (req, res) => {
  try {
    // Check if it's already in trash, if so, maybe permanent delete? 
    // The rule says "Permanent delete (if any) must be explicit".
    // For now, let's just make DELETE move to trash if it's not already there.
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "❌ Blog not found" });

    if (blog.status === "trash") {
      // Explicit permanent delete if already in trash
      await Blog.findByIdAndDelete(req.params.id);
      return res.json({ message: "✅ Blog permanently deleted" });
    }

    blog.status = "trash";
    await blog.save();
    res.json({ message: "✅ Blog moved to trash" });
  } catch (err) {
    console.error("❌ Delete error:", err.message);
    res.status(500).json({ message: "❌ Failed to delete blog" });
  }
});


// ✅ GET → /api/blogs/admin/all
router.get("/admin/all", ...contentView, async (req, res) => {
  try {
    const blogs = await Blog.find()
      .populate("categories", "name")
      .populate("category", "name") // Legacy single category for cards that use it
      .sort({ createdAt: -1 });
    res.json({ blogs });
  } catch (err) {
    console.error("❌ Admin blog fetch error:", err.message);
    res.status(500).json({ message: "❌ Failed to fetch blogs" });
  }
});

/* -------------------------------------------------------------------------- */
/*                         🔍 SEO METADATA ROUTES                             */
/* -------------------------------------------------------------------------- */

// GET → /api/blogs/seo/listing?page=1
router.get("/seo/listing", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const total = await Blog.countDocuments({ status: "published" });
    const totalPages = Math.ceil(total / 15);

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const seoMetadata = generateBlogListingSEOMetadata(page, totalPages, baseUrl);

    res.json({ seoMetadata });
  } catch (err) {
    console.error("❌ Blog listing SEO error:", err.message);
    res.status(500).json({ message: "❌ Failed to generate listing SEO metadata" });
  }
});

// GET → /api/blogs/seo/category/:categoryName?page=1
router.get("/seo/category/:categoryName", async (req, res) => {
  try {
    const { categoryName } = req.params;
    const page = parseInt(req.query.page) || 1;

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const seoMetadata = generateBlogCategorySEOMetadata(categoryName, page, baseUrl);

    res.json({ seoMetadata });
  } catch (err) {
    console.error("❌ Blog category SEO error:", err.message);
    res.status(500).json({ message: "❌ Failed to generate category SEO metadata" });
  }
});

// GET → /api/blogs/seo/tag/:tag
router.get("/seo/tag/:tag", async (req, res) => {
  try {
    const { tag } = req.params;

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const seoMetadata = generateBlogTagSEOMetadata(tag, baseUrl);

    res.json({ seoMetadata });
  } catch (err) {
    console.error("❌ Blog tag SEO error:", err.message);
    res.status(500).json({ message: "❌ Failed to generate tag SEO metadata" });
  }
});

// POST → /api/blogs/seo/validate
router.post("/seo/validate", async (req, res) => {
  try {
    const seoData = req.body;
    const validation = validateSEOMetadata(seoData);

    res.json({ validation });
  } catch (err) {
    console.error("❌ SEO validation error:", err.message);
    res.status(500).json({ message: "❌ Failed to validate SEO metadata" });
  }
});

module.exports = router;
