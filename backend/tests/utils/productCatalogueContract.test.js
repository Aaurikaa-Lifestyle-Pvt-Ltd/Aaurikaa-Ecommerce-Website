// backend/tests/utils/productCatalogueContract.test.js
const {
  CATALOGUE_CSV_COLUMNS,
  buildCatalogueExportRow,
  buildCatalogueExportRows,
  normalizeCatalogueImportRow,
  normalizeCatalogueImportRows,
  serializeKeyFeatures,
  serializeFaq,
  parseKeyFeaturesInput,
  parseFaqInput,
  splitList,
} = require('../../utils/productCatalogueContract');
const { formatProductsForExport } = require('../../utils/productExportService');
const { parseUploadFile } = require('../../utils/productImportExport/parseUploadFile');
const { convertProductRow } = require('../../utils/bulkUploadTypeConverter');

describe('productCatalogueContract', () => {
  test('CATALOGUE_CSV_COLUMNS contains exactly 20 locked fields', () => {
    expect(CATALOGUE_CSV_COLUMNS).toHaveLength(20);
    expect(CATALOGUE_CSV_COLUMNS).toEqual([
      'productName',
      'sku',
      'category',
      'subcategory',
      'childCategory',
      'listPrice',
      'salePrice',
      'stock',
      'weight',
      'hsnCode',
      'taxRate',
      'taxIncluded',
      'mainImage',
      'galleryImages',
      'video',
      'description',
      'care',
      'manufacturerDetails',
      'keyFeatures',
      'faq',
    ]);
    expect(CATALOGUE_CSV_COLUMNS).not.toContain('weightClass');
  });

  test('operator export uses only catalogue columns in order', () => {
    const csv = formatProductsForExport(
      [
        {
          name: 'Stud Earrings',
          sku: 'AUR-001',
          regularPrice: 1000,
          salePrice: 900,
          stock: 5,
          weight: 3,
          category: { name: 'Earrings' },
          subcategory: { name: 'Studs' },
          hsnCode: '7113',
          taxRate: 3,
          taxIncluded: true,
          longDesc: 'Beautiful studs',
          usageSafetyContent: 'Store dry',
          manufacturerConditions: { details: 'Made in India' },
          features: [{ key: 'Lightweight', value: 'Lightweight' }],
          qandas: [{ question: 'Is it gold?', answer: 'Yes, 22K' }],
          galleryImages: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
        },
      ],
      { operator: true }
    );
    const header = csv.split(/\r?\n/)[0];
    expect(header).toBe(CATALOGUE_CSV_COLUMNS.join(','));
    expect(header).not.toContain('contractVersion');
    expect(header).not.toContain('sellerShopName');
    expect(header).not.toContain('variantSku');
    expect(header).not.toContain('brand');
    expect(header).not.toContain('approvalStatus');
    expect(csv).toContain('Stud Earrings');
    expect(csv).toContain('https://example.com/a.jpg | https://example.com/b.jpg');
    expect(csv).toContain('Lightweight');
    expect(csv).toContain('Is it gold?');
  });

  test('buildCatalogueExportRow maps backend fields to operator columns', () => {
    const row = buildCatalogueExportRow({
      name: 'Ring',
      sku: 'R-1',
      regularPrice: 500,
      longDesc: 'Desc',
      usageSafetyContent: 'Care text',
      manufacturerConditions: { details: 'Maker info' },
      features: [{ key: 'Gold plated', value: 'Gold plated' }],
      qandas: [{ question: 'Q?', answer: 'A.' }],
    });
    expect(row.productName).toBe('Ring');
    expect(row.listPrice).toBe(500);
    expect(row.description).toBe('Desc');
    expect(row.care).toBe('Care text');
    expect(row.manufacturerDetails).toBe('Maker info');
    expect(row.keyFeatures).toBe('Gold plated');
    expect(row.faq).toContain('Q?');
  });

  test('catalogue export converts TipTap JSON to plain text (never raw JSON)', () => {
    const tiptapDoc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Handcrafted 22K gold studs with mirror finish.' }],
        },
      ],
    });
    const emptyDoc = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { textAlign: null } }],
    });

    const row = buildCatalogueExportRow({
      name: 'Studs',
      sku: 'S-1',
      regularPrice: 100,
      stock: 1,
      longDesc: tiptapDoc,
      usageSafetyContent: emptyDoc,
      manufacturerConditions: {
        details: JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Made in India by AAURIKAA.' }],
            },
          ],
        }),
      },
      features: JSON.stringify([{ key: 'Material', value: 'Gold' }]),
      qandas: JSON.stringify([{ question: 'Is it real gold?', answer: 'Yes, 22K.' }]),
    });

    expect(row.description).toBe('Handcrafted 22K gold studs with mirror finish.');
    expect(row.description).not.toContain('"type":"doc"');
    expect(row.care).toBe('');
    expect(row.manufacturerDetails).toBe('Made in India by AAURIKAA.');
    expect(row.keyFeatures).toBe('Material: Gold');
    expect(row.faq).toBe('Is it real gold? | Yes, 22K.');
  });

  test('serializeCatalogueTextField returns empty for blank TipTap docs', () => {
    const { serializeCatalogueTextField } = require('../../utils/productCatalogueContract');
    const empty = serializeCatalogueTextField(
      '{"type":"doc","content":[{"type":"paragraph","attrs":{"textAlign":null}}]}'
    );
    expect(empty).toBe('');
  });

  test('normalizeCatalogueImportRow maps catalogue columns to internal fields', () => {
    const internal = normalizeCatalogueImportRow({
      productName: 'Imported Ring',
      listPrice: '1200',
      stock: '3',
      category: 'Rings',
      weightClass: 'Standard',
      description: 'Long desc',
      care: 'Keep dry',
      keyFeatures: 'Lightweight | Hypoallergenic',
      faq: 'What metal? | 22K gold ;; Is it returnable? | See policy',
      galleryImages: 'https://example.com/1.jpg | https://example.com/2.jpg',
    });
    expect(internal.name).toBe('Imported Ring');
    expect(internal.regularPrice).toBe('1200');
    expect(internal.longDesc).toBe('Long desc');
    expect(internal.usageSafetyContent).toBe('Keep dry');
    expect(internal.features).toHaveLength(2);
    expect(internal.qandas).toHaveLength(2);
    expect(internal.productName).toBeUndefined();
    expect(internal.listPrice).toBeUndefined();
    expect(internal.contractVersion).toBe('2.0');
  });

  test('full technical import rows pass through without catalogue remapping', () => {
    const row = normalizeCatalogueImportRow({
      contractVersion: '2.0',
      name: 'Technical Product',
      regularPrice: '99',
      stock: '1',
      category: 'Cat',
      weightClass: 'Standard',
      variants: '[]',
    });
    expect(row.name).toBe('Technical Product');
    expect(row.regularPrice).toBe('99');
    expect(row.variants).toBe('[]');
  });

  test('CSV catalogue format parses and converts for import pipeline', async () => {
    const headers = CATALOGUE_CSV_COLUMNS.join(',');
    const line = [
      'Catalogue Item',
      'CAT-SKU-1',
      'Earrings',
      'Studs',
      '',
      '1500',
      '',
      '10',
      '2',
      '7113',
      '3',
      'TRUE',
      '',
      '',
      '',
      'Description here',
      'Care notes',
      '',
      'Lightweight | Gold plated',
      'What is it? | A stud ;; How to clean? | Wipe gently',
    ].join(',');
    const csv = `${headers}\n${line}`;
    const rows = await parseUploadFile({
      buffer: Buffer.from(csv),
      originalname: 'catalogue.csv',
      mimetype: 'text/csv',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Catalogue Item');
    expect(rows[0].regularPrice).toBe('1500');
    expect(rows[0].features).toHaveLength(2);
    expect(rows[0].qandas).toHaveLength(2);

    const sellerId = '507f1f77bcf86cd799439011';
    const converted = await convertProductRow(rows[0], sellerId);
    expect(converted.regularPrice).toBe(1500);
    expect(converted.features[0].key).toBe('Lightweight');
    expect(converted.qandas[0].question).toBe('What is it?');
  });

  test('human-friendly parsers round-trip key features and FAQ', () => {
    const features = [{ key: 'Material', value: 'Gold' }, { key: 'Lightweight', value: 'Lightweight' }];
    const serialized = serializeKeyFeatures(features);
    expect(serialized).toBe('Material: Gold | Lightweight');
    const parsed = parseKeyFeaturesInput(serialized);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ key: 'Material', value: 'Gold' });

    const faq = [{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2' }];
    const faqText = serializeFaq(faq);
    const faqParsed = parseFaqInput(faqText);
    expect(faqParsed).toEqual(faq);
  });

  test('splitList handles pipe and comma delimiters', () => {
    expect(splitList('a.jpg | b.jpg')).toEqual(['a.jpg', 'b.jpg']);
    expect(splitList('a.jpg,b.jpg')).toEqual(['a.jpg', 'b.jpg']);
  });

  test('buildCatalogueExportRows returns array aligned to contract', () => {
    const rows = buildCatalogueExportRows([{ name: 'A', sku: '1', regularPrice: 1, stock: 1 }]);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).toEqual(CATALOGUE_CSV_COLUMNS);
  });

  test('normalizeCatalogueImportRows maps each row', () => {
    const rows = normalizeCatalogueImportRows([
      { productName: 'One', listPrice: '1', stock: '1', category: 'C' },
    ]);
    expect(rows[0].name).toBe('One');
  });
});
