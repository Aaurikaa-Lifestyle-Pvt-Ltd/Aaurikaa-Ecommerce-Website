// backend/tests/utils/categoryCatalogueContract.test.js
const mongoose = require('mongoose');
const {
  CATEGORY_CATALOGUE_COLUMNS,
  buildCatalogueCategoryExportRows,
  buildCatalogueCategoryRow,
  isCatalogueCategoryFormatRows,
  normalizeCatalogueCategoryImportRows,
  deriveTaxonomySlugFromName,
} = require('../../utils/categoryCatalogueContract');
const {
  formatCategoriesForOperatorExport,
  formatCategoriesForExport,
} = require('../../utils/categoryExportService');

describe('categoryCatalogueContract', () => {
  const categories = [
    {
      _id: '507f1f77bcf86cd799439001',
      name: 'Earrings',
      slug: 'earrings',
      image: 'earrings.jpg',
      taxRate: 3,
      taxType: 'GST',
    },
  ];
  const subcategories = [
    {
      _id: '507f1f77bcf86cd799439002',
      name: 'Studs',
      slug: 'studs',
      category: '507f1f77bcf86cd799439001',
      image: 'studs.jpg',
      taxRate: 3,
      taxType: 'GST',
    },
  ];
  const childCategories = [
    {
      _id: '507f1f77bcf86cd799439003',
      name: '22K Gold',
      slug: '22k-gold',
      subcategory: '507f1f77bcf86cd799439002',
      taxRate: 3,
      taxType: 'GST',
    },
  ];

  test('CATEGORY_CATALOGUE_COLUMNS contains exactly 8 locked fields', () => {
    expect(CATEGORY_CATALOGUE_COLUMNS).toHaveLength(8);
    expect(CATEGORY_CATALOGUE_COLUMNS).toEqual([
      'level',
      'name',
      'slug',
      'parentCategory',
      'parentSubcategory',
      'image',
      'taxRate',
      'taxType',
    ]);
  });

  test('operator export uses only catalogue columns in order', () => {
    const csv = formatCategoriesForOperatorExport(categories, subcategories, childCategories);
    const header = csv.split(/\r?\n/)[0];
    expect(header).toBe(CATEGORY_CATALOGUE_COLUMNS.join(','));
    expect(header).not.toContain('contractVersion');
    expect(header).not.toContain('commissionRate');
    expect(header).not.toContain('faq');
    expect(csv).toContain('earrings');
    expect(csv).toContain('studs');
    expect(csv).toContain('childCategory');
  });

  test('full export still includes technical columns', () => {
    const csv = formatCategoriesForExport(categories, subcategories, childCategories);
    expect(csv).toContain('contractVersion');
    expect(csv).toContain('commissionRate');
    expect(csv).toContain('showInMegaMenu');
  });

  test('buildCatalogueCategoryExportRows preserves hierarchy and image per level', () => {
    const rows = buildCatalogueCategoryExportRows(categories, subcategories, childCategories);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      level: 'category',
      name: 'Earrings',
      slug: 'earrings',
    });
    expect(String(rows[0].image)).toContain('earrings.jpg');
    expect(rows[1]).toMatchObject({
      level: 'subcategory',
      parentCategory: 'Earrings',
    });
    expect(String(rows[1].image)).toContain('studs.jpg');
    expect(rows[2]).toMatchObject({
      level: 'childCategory',
      parentCategory: 'Earrings',
      parentSubcategory: 'Studs',
    });
  });

  test('normalizeCatalogueCategoryImportRows auto-generates slug from name when blank', () => {
    const rows = normalizeCatalogueCategoryImportRows([
      {
        level: 'subcategory',
        name: 'Chain Bracelets',
        parentCategory: 'bracelets',
      },
    ]);
    expect(rows[0].slug).toBe(deriveTaxonomySlugFromName('Chain Bracelets'));
    expect(rows[0].slug).toBe('chain-bracelets');
  });

  test('normalizeCatalogueCategoryImportRows keeps catalogue rows only', () => {
    const rows = normalizeCatalogueCategoryImportRows([
      {
        level: 'category',
        name: 'Rings',
        slug: 'rings',
        taxRate: 3,
        taxType: 'GST',
      },
    ]);
    expect(rows[0]).toEqual({
      level: 'category',
      name: 'Rings',
      slug: 'rings',
      taxRate: 3,
      taxType: 'GST',
    });
    expect(isCatalogueCategoryFormatRows(rows)).toBe(true);
  });

  test('never emits MongoDB ObjectId strings for parentCategory', () => {
    const categoryId = new mongoose.Types.ObjectId('6a88483db4680232ffc09b97');
    const rows = buildCatalogueCategoryExportRows(
      [{ _id: categoryId, name: 'Bracelets', slug: 'bracelets' }],
      [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Chain Bracelets',
          slug: 'chain-bracelets',
          category: categoryId,
        },
      ],
      []
    );
    expect(rows[1].parentCategory).toBe('Bracelets');
    expect(rows[1].parentCategory).not.toMatch(/^[a-f0-9]{24}$/i);
  });

  test('uses populated category display name when sub.category is populated', () => {
    const rows = buildCatalogueCategoryExportRows(
      [],
      [
        {
          name: 'Stud Earrings',
          slug: 'stud-earrings',
          category: { _id: '6a871bb942e9b196c6c14a64', name: 'Earrings', slug: 'earrings' },
        },
      ],
      []
    );
    expect(rows[0].parentCategory).toBe('Earrings');
  });

  test('buildCatalogueCategoryRow returns ordered fields', () => {
    const row = buildCatalogueCategoryRow({
      level: 'category',
      name: 'Necklaces',
      slug: 'necklaces',
      taxRate: 3,
      taxType: 'GST',
    });
    expect(Object.keys(row)).toEqual(CATEGORY_CATALOGUE_COLUMNS);
  });
});
