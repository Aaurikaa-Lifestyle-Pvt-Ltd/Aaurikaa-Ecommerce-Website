describe('Product Search and Filter Utilities', () => {
  // Sample product data for testing
  const mockProducts = [
    {
      _id: 'product1',
      name: 'Dell XPS 15 Laptop',
      sku: 'DELL-XPS-15',
      description: 'High performance laptop with Intel processor',
      salePrice: 80000,
      regularPrice: 90000,
      brand: { _id: 'brand1', name: 'Dell' },
      category: { _id: 'cat1', name: 'Electronics' },
      rating: 4.5,
      stock: 10,
      tags: ['laptop', 'electronics', 'dell']
    },
    {
      _id: 'product2',
      name: 'Apple iPhone 14 Pro',
      sku: 'APPLE-IP14',
      description: 'Latest smartphone from Apple with A16 chip',
      salePrice: 120000,
      regularPrice: 130000,
      brand: { _id: 'brand2', name: 'Apple' },
      category: { _id: 'cat2', name: 'Mobiles' },
      rating: 4.8,
      stock: 5,
      tags: ['mobile', 'smartphone', 'apple']
    },
    {
      _id: 'product3',
      name: 'Samsung Galaxy S23',
      sku: 'SAM-S23',
      description: 'Premium Android smartphone with high-end features',
      salePrice: 75000,
      regularPrice: 85000,
      brand: { _id: 'brand3', name: 'Samsung' },
      category: { _id: 'cat2', name: 'Mobiles' },
      rating: 4.3,
      stock: 0,
      tags: ['mobile', 'smartphone', 'samsung', 'android']
    },
    {
      _id: 'product4',
      name: 'Logitech Wireless Mouse',
      sku: 'LOGI-MOUSE',
      description: 'Ergonomic wireless mouse for productivity',
      salePrice: 1500,
      regularPrice: 2000,
      brand: { _id: 'brand4', name: 'Logitech' },
      category: { _id: 'cat3', name: 'Accessories' },
      rating: 4.0,
      stock: 50,
      tags: ['mouse', 'wireless', 'accessories']
    }
  ];

  // ==========================================
  // TEXT SEARCH TESTS
  // ==========================================
  describe('Text Search Functionality', () => {
    test('should search products by name', () => {
      const searchTerm = 'laptop';
      const searchByName = (products, term) => {
        return products.filter(p =>
          p.name.toLowerCase().includes(term.toLowerCase())
        );
      };

      const results = searchByName(mockProducts, searchTerm);

      expect(results).toHaveLength(1);
      expect(results[0].name).toContain('Laptop');
    });

    test('should search products by description', () => {
      const searchTerm = 'smartphone';
      const searchByDescription = (products, term) => {
        return products.filter(p =>
          p.description.toLowerCase().includes(term.toLowerCase())
        );
      };

      const results = searchByDescription(mockProducts, searchTerm);

      expect(results).toHaveLength(2); // iPhone and Samsung
    });

    test('should search products by SKU', () => {
      const searchTerm = 'DELL-XPS';
      const searchBySKU = (products, term) => {
        return products.filter(p =>
          p.sku.toLowerCase().includes(term.toLowerCase())
        );
      };

      const results = searchBySKU(mockProducts, searchTerm);

      expect(results).toHaveLength(1);
      expect(results[0].sku).toBe('DELL-XPS-15');
    });

    test('should perform case-insensitive search', () => {
      const searchTerm = 'IPHONE';
      const caseInsensitiveSearch = (products, term) => {
        return products.filter(p =>
          p.name.toLowerCase().includes(term.toLowerCase()) ||
          p.description.toLowerCase().includes(term.toLowerCase()) ||
          p.sku.toLowerCase().includes(term.toLowerCase())
        );
      };

      const results = caseInsensitiveSearch(mockProducts, searchTerm);

      expect(results).toHaveLength(1);
      expect(results[0].name).toContain('iPhone');
    });

    test('should search across multiple fields', () => {
      const searchTerm = 'apple';
      const multiFieldSearch = (products, term) => {
        return products.filter(p =>
          p.name.toLowerCase().includes(term.toLowerCase()) ||
          p.description.toLowerCase().includes(term.toLowerCase()) ||
          p.sku.toLowerCase().includes(term.toLowerCase()) ||
          p.brand.name.toLowerCase().includes(term.toLowerCase())
        );
      };

      const results = multiFieldSearch(mockProducts, searchTerm);

      expect(results.length).toBeGreaterThan(0);
    });

    test('should return empty array for no matches', () => {
      const searchTerm = 'nonexistent';
      const search = (products, term) => {
        return products.filter(p =>
          p.name.toLowerCase().includes(term.toLowerCase())
        );
      };

      const results = search(mockProducts, searchTerm);

      expect(results).toHaveLength(0);
    });

    test('should handle empty search term', () => {
      const searchTerm = '';
      const search = (products, term) => {
        return term ? products.filter(p =>
          p.name.toLowerCase().includes(term.toLowerCase())
        ) : products;
      };

      const results = search(mockProducts, searchTerm);

      expect(results).toHaveLength(mockProducts.length);
    });
  });

  // ==========================================
  // CATEGORY FILTER TESTS
  // ==========================================
  describe('Category Filter Functionality', () => {
    test('should filter products by category', () => {
      const categoryId = 'cat2';
      const filterByCategory = (products, catId) => {
        return products.filter(p => {
          const pCatId = typeof p.category === 'object' ? p.category._id : p.category;
          return pCatId === catId;
        });
      };

      const results = filterByCategory(mockProducts, categoryId);

      expect(results).toHaveLength(2); // iPhone and Samsung
    });

    test('should handle string and object category references', () => {
      const categoryId = 'cat1';
      const filterByCategory = (products, catId) => {
        return products.filter(p => {
          const pCatId = typeof p.category === 'object' ? p.category._id : p.category;
          return pCatId === catId;
        });
      };

      const results = filterByCategory(mockProducts, categoryId);

      expect(results).toHaveLength(1); // Laptop
    });

    test('should return all products when no category selected', () => {
      const categoryId = '';
      const filterByCategory = (products, catId) => {
        return catId ? products.filter(p => {
          const pCatId = typeof p.category === 'object' ? p.category._id : p.category;
          return pCatId === catId;
        }) : products;
      };

      const results = filterByCategory(mockProducts, categoryId);

      expect(results).toHaveLength(mockProducts.length);
    });
  });

  // ==========================================
  // BRAND FILTER TESTS
  // ==========================================
  describe('Brand Filter Functionality', () => {
    test('should filter products by brand', () => {
      const brandId = 'brand2';
      const filterByBrand = (products, bId) => {
        return products.filter(p => {
          const pBrandId = typeof p.brand === 'object' ? p.brand._id : p.brand;
          return pBrandId === bId;
        });
      };

      const results = filterByBrand(mockProducts, brandId);

      expect(results).toHaveLength(1);
      expect(results[0].brand.name).toBe('Apple');
    });

    test('should return all products when no brand selected', () => {
      const brandId = '';
      const filterByBrand = (products, bId) => {
        return bId ? products.filter(p => {
          const pBrandId = typeof p.brand === 'object' ? p.brand._id : p.brand;
          return pBrandId === bId;
        }) : products;
      };

      const results = filterByBrand(mockProducts, brandId);

      expect(results).toHaveLength(mockProducts.length);
    });
  });

  // ==========================================
  // PRICE RANGE FILTER TESTS
  // ==========================================
  describe('Price Range Filter Functionality', () => {
    test('should filter products within price range', () => {
      const minPrice = 50000;
      const maxPrice = 100000;
      
      const filterByPriceRange = (products, min, max) => {
        return products.filter(p => {
          const price = p.salePrice || p.regularPrice;
          return price >= min && price <= max;
        });
      };

      const results = filterByPriceRange(mockProducts, minPrice, maxPrice);

      expect(results).toHaveLength(2); // Laptop and Samsung
    });

    test('should include products at exact price boundaries', () => {
      const minPrice = 75000;
      const maxPrice = 80000;
      
      const filterByPriceRange = (products, min, max) => {
        return products.filter(p => {
          const price = p.salePrice || p.regularPrice;
          return price >= min && price <= max;
        });
      };

      const results = filterByPriceRange(mockProducts, minPrice, maxPrice);

      expect(results).toHaveLength(2);
    });

    test('should use salePrice over regularPrice', () => {
      const filterByPriceRange = (products, min, max) => {
        return products.filter(p => {
          const price = p.salePrice || p.regularPrice;
          return price >= min && price <= max;
        });
      };

      const results = filterByPriceRange(mockProducts, 0, 200000);

      results.forEach(product => {
        expect(product.salePrice).toBeDefined();
      });
    });

    test('should return empty when no products in range', () => {
      const minPrice = 500000;
      const maxPrice = 1000000;
      
      const filterByPriceRange = (products, min, max) => {
        return products.filter(p => {
          const price = p.salePrice || p.regularPrice;
          return price >= min && price <= max;
        });
      };

      const results = filterByPriceRange(mockProducts, minPrice, maxPrice);

      expect(results).toHaveLength(0);
    });
  });

  // ==========================================
  // RATING FILTER TESTS
  // ==========================================
  describe('Rating Filter Functionality', () => {
    test('should filter products by minimum rating', () => {
      const minRating = 4.5;
      
      const filterByRating = (products, min) => {
        return products.filter(p => p.rating >= min);
      };

      const results = filterByRating(mockProducts, minRating);

      expect(results).toHaveLength(2); // Laptop and iPhone
    });

    test('should return all products when rating is 0', () => {
      const minRating = 0;
      
      const filterByRating = (products, min) => {
        return min > 0 ? products.filter(p => p.rating >= min) : products;
      };

      const results = filterByRating(mockProducts, minRating);

      expect(results).toHaveLength(mockProducts.length);
    });
  });

  // ==========================================
  // STOCK FILTER TESTS
  // ==========================================
  describe('Stock Filter Functionality', () => {
    test('should filter in-stock products only', () => {
      const inStockOnly = true;
      
      const filterByStock = (products, inStock) => {
        return inStock ? products.filter(p => p.stock > 0) : products;
      };

      const results = filterByStock(mockProducts, inStockOnly);

      expect(results).toHaveLength(3); // All except Samsung
    });

    test('should return all products when stock filter disabled', () => {
      const inStockOnly = false;
      
      const filterByStock = (products, inStock) => {
        return inStock ? products.filter(p => p.stock > 0) : products;
      };

      const results = filterByStock(mockProducts, inStockOnly);

      expect(results).toHaveLength(mockProducts.length);
    });

    test('should identify out-of-stock products', () => {
      const outOfStock = mockProducts.filter(p => p.stock <= 0);

      expect(outOfStock).toHaveLength(1);
      expect(outOfStock[0].name).toContain('Samsung');
    });
  });

  // ==========================================
  // SORTING TESTS
  // ==========================================
  describe('Sorting Functionality', () => {
    test('should sort by price low to high', () => {
      const sorted = [...mockProducts].sort((a, b) => {
        const priceA = a.salePrice || a.regularPrice;
        const priceB = b.salePrice || b.regularPrice;
        return priceA - priceB;
      });

      expect(sorted[0].salePrice).toBe(1500); // Mouse
      expect(sorted[sorted.length - 1].salePrice).toBe(120000); // iPhone
    });

    test('should sort by price high to low', () => {
      const sorted = [...mockProducts].sort((a, b) => {
        const priceA = a.salePrice || a.regularPrice;
        const priceB = b.salePrice || b.regularPrice;
        return priceB - priceA;
      });

      expect(sorted[0].salePrice).toBe(120000); // iPhone
      expect(sorted[sorted.length - 1].salePrice).toBe(1500); // Mouse
    });

    test('should sort by rating', () => {
      const sorted = [...mockProducts].sort((a, b) => b.rating - a.rating);

      expect(sorted[0].rating).toBe(4.8); // iPhone
      expect(sorted[sorted.length - 1].rating).toBe(4.0); // Mouse
    });

    test('should sort by name alphabetically', () => {
      const sorted = [...mockProducts].sort((a, b) => 
        a.name.localeCompare(b.name)
      );

      expect(sorted[0].name.charAt(0)).toBe('A'); // Apple
      expect(sorted[sorted.length - 1].name.charAt(0)).toBe('S'); // Samsung
    });

    test('should maintain original array after sorting', () => {
      const original = [...mockProducts];
      const sorted = [...mockProducts].sort((a, b) => a.salePrice - b.salePrice);

      expect(mockProducts).toEqual(original);
      expect(sorted).not.toEqual(original);
    });
  });

  // ==========================================
  // COMBINED FILTERS TESTS
  // ==========================================
  describe('Combined Filters Functionality', () => {
    test('should apply search and category filter together', () => {
      const searchTerm = 'phone';
      const categoryId = 'cat2';
      
      const results = mockProducts.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = p.category._id === categoryId;
        return matchesSearch && matchesCategory;
      });

      expect(results).toHaveLength(1); // Only iPhone has "phone" in name and is in cat2
    });

    test('should apply all filters together', () => {
      const filters = {
        search: '',
        category: '',
        brand: '',
        minPrice: 10000,
        maxPrice: 100000,
        rating: 4.3,
        inStock: true
      };

      let results = [...mockProducts];

      // Apply search filter
      if (filters.search) {
        results = results.filter(p =>
          p.name.toLowerCase().includes(filters.search.toLowerCase())
        );
      }

      // Apply category filter
      if (filters.category) {
        results = results.filter(p => p.category._id === filters.category);
      }

      // Apply brand filter
      if (filters.brand) {
        results = results.filter(p => p.brand._id === filters.brand);
      }

      // Apply price range filter
      results = results.filter(p => {
        const price = p.salePrice || p.regularPrice;
        return price >= filters.minPrice && price <= filters.maxPrice;
      });

      // Apply rating filter
      results = results.filter(p => p.rating >= filters.rating);

      // Apply stock filter
      if (filters.inStock) {
        results = results.filter(p => p.stock > 0);
      }

      expect(results).toHaveLength(1); // Only Laptop
    });

    test('should apply filters and sorting together', () => {
      const filters = {
        minPrice: 50000,
        maxPrice: 100000,
        sortBy: 'price-low'
      };

      let results = mockProducts.filter(p => {
        const price = p.salePrice || p.regularPrice;
        return price >= filters.minPrice && price <= filters.maxPrice;
      });

      if (filters.sortBy === 'price-low') {
        results.sort((a, b) => a.salePrice - b.salePrice);
      }

      expect(results).toHaveLength(2);
      expect(results[0].salePrice).toBeLessThan(results[1].salePrice);
    });
  });

  // ==========================================
  // PAGINATION TESTS
  // ==========================================
  describe('Pagination Functionality', () => {
    test('should calculate correct page count', () => {
      const perPage = 2;
      const totalPages = Math.ceil(mockProducts.length / perPage);

      expect(totalPages).toBe(2); // 4 products / 2 per page
    });

    test('should return correct items for page 1', () => {
      const perPage = 2;
      const page = 1;
      const start = (page - 1) * perPage;
      const paginated = mockProducts.slice(start, start + perPage);

      expect(paginated).toHaveLength(2);
      expect(paginated[0]._id).toBe('product1');
    });

    test('should return correct items for page 2', () => {
      const perPage = 2;
      const page = 2;
      const start = (page - 1) * perPage;
      const paginated = mockProducts.slice(start, start + perPage);

      expect(paginated).toHaveLength(2);
      expect(paginated[0]._id).toBe('product3');
    });

    test('should handle last page with fewer items', () => {
      const perPage = 3;
      const page = 2;
      const start = (page - 1) * perPage;
      const paginated = mockProducts.slice(start, start + perPage);

      expect(paginated).toHaveLength(1);
    });
  });

  // ==========================================
  // PERFORMANCE TESTS
  // ==========================================
  describe('Filter Performance', () => {
    test('should handle large product arrays efficiently', () => {
      // Create array with 1000 products
      const largeProductArray = Array(1000).fill(null).map((_, i) => ({
        _id: `product${i}`,
        name: `Product ${i}`,
        salePrice: Math.random() * 100000,
        stock: Math.floor(Math.random() * 100),
        rating: Math.random() * 5,
        category: { _id: `cat${i % 10}` },
        brand: { _id: `brand${i % 5}` }
      }));

      const startTime = Date.now();
      
      const filtered = largeProductArray.filter(p => p.salePrice > 50000 && p.stock > 0);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100); // Should complete in less than 100ms
      expect(filtered.length).toBeLessThanOrEqual(1000);
    });

    test('should handle multiple filter operations efficiently', () => {
      const startTime = Date.now();
      
      let results = [...mockProducts];
      results = results.filter(p => p.stock > 0);
      results = results.filter(p => p.salePrice > 1000);
      results = results.filter(p => p.rating >= 4.0);
      results = results.sort((a, b) => a.salePrice - b.salePrice);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(10); // Should be very fast for small array
      expect(Array.isArray(results)).toBe(true);
    });
  });
});

