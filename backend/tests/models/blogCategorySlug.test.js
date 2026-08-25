// backend/tests/models/blogCategorySlug.test.js
const mongoose = require('mongoose');
const BlogCategory = require('../../models/BlogCategory');

describe('Blog Category Slug Validation', () => {
  afterAll(async () => {
    await BlogCategory.deleteMany({});
    await mongoose.connection.close();
  });

  describe('Slug generation', () => {
    test('should auto-generate slug from name', async () => {
      const category = new BlogCategory({
        name: 'Technology News',
        description: 'Latest technology news'
      });

      await category.save();

      expect(category.slug).toBe('technology-news');
    });

    test('should handle special characters in slug generation', async () => {
      const category = new BlogCategory({
        name: 'Tech & Innovation',
        description: 'Technology and innovation'
      });

      await category.save();

      expect(category.slug).toBe('tech-innovation');
    });

    test('should handle numbers in slug generation', async () => {
      const category = new BlogCategory({
        name: 'Category 2024',
        description: 'Category for year 2024'
      });

      await category.save();

      expect(category.slug).toBe('category-2024');
    });

    test('should handle multiple spaces in slug generation', async () => {
      const category = new BlogCategory({
        name: 'Multiple   Spaces   Here',
        description: 'Category with multiple spaces'
      });

      await category.save();

      expect(category.slug).toBe('multiple-spaces-here');
    });
  });

  describe('Slug uniqueness and conflict resolution', () => {
    test('should handle slug conflicts by appending numbers', async () => {
      // Create first category
      const category1 = new BlogCategory({
        name: 'Test Category',
        description: 'First test category'
      });
      await category1.save();

      // Create second category with same name
      const category2 = new BlogCategory({
        name: 'Test Category',
        description: 'Second test category'
      });
      await category2.save();

      expect(category1.slug).toBe('test-category');
      expect(category2.slug).toBe('test-category-1');
    });

    test('should handle multiple slug conflicts', async () => {
      // Create multiple categories with same name
      const categories = [];
      for (let i = 0; i < 3; i++) {
        const category = new BlogCategory({
          name: 'Duplicate Category',
          description: `Category ${i + 1}`
        });
        await category.save();
        categories.push(category);
      }

      expect(categories[0].slug).toBe('duplicate-category');
      expect(categories[1].slug).toBe('duplicate-category-1');
      expect(categories[2].slug).toBe('duplicate-category-2');
    });

    test('should not conflict with existing slug when updating', async () => {
      const category = new BlogCategory({
        name: 'Original Category',
        description: 'Original description'
      });
      await category.save();

      // Update the category name
      category.name = 'Updated Category';
      await category.save();

      expect(category.slug).toBe('updated-category');
    });
  });

  describe('Slug validation', () => {
    test('should reject invalid slug format', async () => {
      const category = new BlogCategory({
        name: 'Valid Category',
        slug: 'Invalid_Slug@#$'
      });

      await expect(category.save()).rejects.toThrow();
    });

    test('should reject slug with uppercase letters', async () => {
      const category = new BlogCategory({
        name: 'Valid Category',
        slug: 'Invalid-Slug'
      });

      await expect(category.save()).rejects.toThrow();
    });

    test('should reject slug with spaces', async () => {
      const category = new BlogCategory({
        name: 'Valid Category',
        slug: 'invalid slug'
      });

      await expect(category.save()).rejects.toThrow();
    });

    test('should accept valid slug format', async () => {
      const category = new BlogCategory({
        name: 'Valid Category',
        slug: 'valid-slug-123'
      });

      await expect(category.save()).resolves.toBeDefined();
      expect(category.slug).toBe('valid-slug-123');
    });
  });

  describe('Name validation', () => {
    test('should reject name that is too short', async () => {
      const category = new BlogCategory({
        name: 'A',
        description: 'Too short name'
      });

      await expect(category.save()).rejects.toThrow();
    });

    test('should reject name that is too long', async () => {
      const longName = 'a'.repeat(51);
      const category = new BlogCategory({
        name: longName,
        description: 'Too long name'
      });

      await expect(category.save()).rejects.toThrow();
    });

    test('should reject name with invalid characters', async () => {
      const category = new BlogCategory({
        name: 'Category@#$%',
        description: 'Invalid characters in name'
      });

      await expect(category.save()).rejects.toThrow();
    });

    test('should accept valid name format', async () => {
      const category = new BlogCategory({
        name: 'Valid Category Name',
        description: 'Valid category'
      });

      await expect(category.save()).resolves.toBeDefined();
    });
  });

  describe('Description validation', () => {
    test('should reject description that is too long', async () => {
      const longDescription = 'a'.repeat(501);
      const category = new BlogCategory({
        name: 'Valid Category',
        description: longDescription
      });

      await expect(category.save()).rejects.toThrow();
    });

    test('should accept valid description', async () => {
      const category = new BlogCategory({
        name: 'Valid Category',
        description: 'This is a valid description'
      });

      await expect(category.save()).resolves.toBeDefined();
    });

    test('should accept empty description', async () => {
      const category = new BlogCategory({
        name: 'Valid Category',
        description: ''
      });

      await expect(category.save()).resolves.toBeDefined();
    });
  });

  describe('Unique constraints', () => {
    test('should reject duplicate category name', async () => {
      const category1 = new BlogCategory({
        name: 'Unique Category',
        description: 'First category'
      });
      await category1.save();

      const category2 = new BlogCategory({
        name: 'Unique Category',
        description: 'Second category'
      });

      await expect(category2.save()).rejects.toThrow();
    });

    test('should reject duplicate slug', async () => {
      const category1 = new BlogCategory({
        name: 'Category One',
        slug: 'unique-slug'
      });
      await category1.save();

      const category2 = new BlogCategory({
        name: 'Category Two',
        slug: 'unique-slug'
      });

      await expect(category2.save()).rejects.toThrow();
    });
  });
});
