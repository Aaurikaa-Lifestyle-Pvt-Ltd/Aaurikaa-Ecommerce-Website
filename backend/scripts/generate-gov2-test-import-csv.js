/**
 * Generates test_import_governance_v2_6products.csv from authoritative export contract.
 * Run: node scripts/generate-gov2-test-import-csv.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const { Readable } = require('stream');
const csvParser = require('csv-parser');
const { convertProductRows } = require('../utils/bulkUploadTypeConverter');
const { validateProductRows } = require('../utils/bulkUploadValidator');
const { validateRowsGovernance } = require('../utils/productImportExport/productImportGovernance');
const { loadGlobalSkuSet } = require('../utils/productImportExport/variantSkuCollision');
const { getContractVersionFromRows } = require('../utils/productImportExport/parseUploadFile');
const {
  generateVariantCombinations,
  normalizeVariantCombination,
} = require('../utils/variantUtils');

const R2 = 'https://pub-0e53393359964a14bf62f5621f5f9565.r2.dev';
const IMG_MAIN = `${R2}/products/1769030759208_bca067fc8f1bc33198b075531094dac8_ChatGPT_Image_Dec_30__2025__04_30_11_PM.png`;
const IMG_G1 = `${R2}/products/1769031340423_a472f8cdf08659de3c540daba105b21c_ChatGPT_Image_Jan_6__2026__01_56_30_PM-removebg-preview__1_.png`;
const IMG_G2 = `${R2}/products/1769031341182_231ff39236a51ddad16cdfcf0a51a903_ChatGPT_Image_Jan_6__2026__01_45_25_PM.png`;
const IMG_VAR_A = `${R2}/products/1771844624302_ab9095913c7745a7758c69db3ebaa9e2_kanjivaram-Navy-Blue-1.webp`;
const IMG_VAR_B = `${R2}/products/1771822839959_38bb22443255c1cedfd83911b3e054e5_Orange-5.webp`;

const EXPORT_COLUMNS = [
  'contractVersion',
  'name',
  'status',
  'approvalStatus',
  'sku',
  'hsnCode',
  'isFeatured',
  'taxIncluded',
  'hasVariants',
  'regularPrice',
  'salePrice',
  'stock',
  'weight',
  'length',
  'width',
  'height',
  'taxRate',
  'weightClass',
  'brand',
  'category',
  'subcategory',
  'childCategory',
  'sellerShopName',
  'sellerName',
  'shortDesc',
  'longDesc',
  'variants',
  'variantPricing',
  'variantStock',
  'variantSku',
  'variantMedia',
  'features',
  'usageInstructions',
  'featuresContent',
  'usageSafetyContent',
  'qandas',
  'bulkDiscount',
  'galleryImages',
  'tags',
  'upsellSkus',
  'crossSellSkus',
  'boughtTogetherSkus',
  'deliveryTime',
  'seo.primaryKeyword',
  'metaTitle',
  'metaDescription',
  'metaKeywords',
  'mainImage',
  'video',
];

const OBSOLETE_EXPORT_COLUMNS = [
  'shippingCharge',
  'shippingType',
  'shippingApplicability',
  'shippingVisibility',
];

function boolStr(v) {
  return v ? 'TRUE' : 'FALSE';
}

function serializeComplex(val) {
  if (!val || (Array.isArray(val) && val.length === 0)) return '[]';
  return JSON.stringify(val);
}

function serializeMixed(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) return '';
  return JSON.stringify(val);
}

function buildVariantMaps({ variants, parentSku, regularPrice, salePrice, stocks, variantSkus, variantMediaByKey }) {
  const combinations = generateVariantCombinations(variants);
  const variantPricing = {};
  const variantStock = {};
  const variantSku = {};
  const variantMedia = {};

  combinations.forEach((combo, i) => {
    const key = normalizeVariantCombination(combo);
    if (!key) return;
    variantPricing[key] = { price: regularPrice, salePrice: salePrice };
    variantStock[key] = stocks[i] ?? 0;
    variantSku[key] = variantSkus[i] || `${parentSku}-VAR-${i + 1}`;
    if (variantMediaByKey && variantMediaByKey[key]) {
      variantMedia[key] = variantMediaByKey[key];
    } else {
      variantMedia[key] = { mainImage: '', galleryImages: [], video: '' };
    }
  });

  const totalStock = Object.values(variantStock).reduce((s, n) => s + Number(n), 0);
  return { variantPricing, variantStock, variantSku, variantMedia, totalStock };
}

function baseRow(overrides) {
  return {
    contractVersion: '2.0',
    name: '',
    status: 'published',
    approvalStatus: '',
    sku: '',
    hsnCode: '',
    isFeatured: 'FALSE',
    taxIncluded: 'FALSE',
    hasVariants: 'FALSE',
    regularPrice: 0,
    salePrice: '',
    stock: 0,
    weight: 0,
    length: 0,
    width: 0,
    height: 0,
    taxRate: 0,
    weightClass: '',
    brand: '',
    category: '',
    subcategory: '',
    childCategory: '',
    sellerShopName: '',
    sellerName: '',
    shortDesc: '',
    longDesc: '',
    variants: '[]',
    variantPricing: '',
    variantStock: '',
    variantSku: '',
    variantMedia: '',
    features: '[]',
    usageInstructions: '[]',
    featuresContent: '',
    usageSafetyContent: '',
    qandas: '[]',
    bulkDiscount: '{}',
    galleryImages: '',
    tags: '',
    upsellSkus: '',
    crossSellSkus: '',
    boughtTogetherSkus: '',
    deliveryTime: '',
    'seo.primaryKeyword': '',
    metaTitle: '',
    metaDescription: '',
    metaKeywords: '',
    mainImage: '',
    video: '',
    ...overrides,
  };
}

function buildProducts(weightClassName) {
  const rows = [];

  rows.push(
    baseRow({
      name: 'Gov2 Test Notebook A5 Ruled 160 Pages',
      sku: 'GOV2TEST-001-STATI-499-SHAM-0299',
      isFeatured: 'TRUE',
      taxIncluded: 'TRUE',
      regularPrice: 499,
      salePrice: 299,
      stock: 120,
      weight: 280,
      length: 21,
      width: 14.5,
      height: 1.2,
      weightClass: weightClassName,
      brand: 'TEZ',
      category: 'Stationery',
      subcategory: 'Notebooks Writing',
      childCategory: '',
      shortDesc: 'Premium A5 ruled notebook for school and office.',
      longDesc: '<p>Durable cover, smooth paper, and reinforced binding for daily use.</p>',
      tags: 'gov2test, notebook, stationery',
      'seo.primaryKeyword': 'gov2test-notebook-a5-001',
      metaTitle: 'Gov2 Test Notebook A5',
      metaDescription: 'Test import notebook for governance v2 validation.',
      metaKeywords: 'gov2test, notebook, test import',
      galleryImages: `${IMG_G1}, ${IMG_G2}`,
      mainImage: IMG_MAIN,
      features: serializeComplex([{ key: 'Pages', value: '160 ruled pages' }]),
      qandas: serializeComplex([
        { question: 'Is this ruled?', answer: 'Yes, fully ruled pages.' },
      ]),
    })
  );

  rows.push(
    baseRow({
      name: 'Gov2 Test USB-C Fast Charger 65W',
      sku: 'GOV2TEST-002-ELECT-1299-SHAM-0999',
      hsnCode: '85044090',
      isFeatured: 'FALSE',
      taxIncluded: 'TRUE',
      regularPrice: 1299,
      salePrice: 999,
      stock: 85,
      weight: 180,
      length: 10,
      width: 6,
      height: 3,
      weightClass: weightClassName,
      brand: 'Generic',
      category: 'Electronics',
      subcategory: 'Beginner Learning',
      childCategory: 'Beginner Circuit Learning Kit',
      shortDesc: 'Compact 65W USB-C PD charger with foldable plug.',
      longDesc: '<p>Supports multiple fast-charge profiles for phones and tablets.</p>',
      tags: 'gov2test, charger, usb-c',
      'seo.primaryKeyword': 'gov2test-usbc-charger-002',
      metaTitle: 'Gov2 Test USB-C Charger 65W',
      metaDescription: 'Electronics test product for import governance.',
      galleryImages: IMG_G1,
      mainImage: IMG_MAIN,
    })
  );

  const apparelVariants = [
    { type: 'Color', values: ['Teal|#008080', 'Coral|#FF7F50', 'Ivory|#FFFFF0'] },
  ];
  const apparelMaps = buildVariantMaps({
    variants: apparelVariants,
    parentSku: 'GOV2TEST-003-APPAR-899-SHAM-0599',
    regularPrice: 899,
    salePrice: 599,
    stocks: [12, 10, 8],
    variantSkus: [
      'GOV2TEST-003-APPAR-899-TEAL-SHAM-0599',
      'GOV2TEST-003-APPAR-899-CORAL-SHAM-0599',
      'GOV2TEST-003-APPAR-899-IVORY-SHAM-0599',
    ],
  });

  rows.push(
    baseRow({
      name: 'Gov2 Test Cotton T-Shirt Classic Fit',
      sku: 'GOV2TEST-003-APPAR-899-SHAM-0599',
      hasVariants: 'TRUE',
      regularPrice: 899,
      salePrice: 599,
      stock: apparelMaps.totalStock,
      weight: 220,
      weightClass: weightClassName,
      brand: 'Yashika',
      category: 'Apparels',
      subcategory: 'Women Clothing',
      childCategory: 'Sarees',
      shortDesc: 'Soft cotton tee with color options.',
      longDesc: '<p>Relaxed fit tee for everyday wear. Machine washable.</p>',
      variants: serializeComplex(apparelVariants),
      variantPricing: serializeMixed(apparelMaps.variantPricing),
      variantStock: serializeMixed(apparelMaps.variantStock),
      variantSku: serializeMixed(apparelMaps.variantSku),
      variantMedia: serializeMixed(apparelMaps.variantMedia),
      tags: 'gov2test, tshirt, apparel',
      'seo.primaryKeyword': 'gov2test-cotton-tee-003',
      metaTitle: 'Gov2 Test Cotton T-Shirt',
      galleryImages: `${IMG_G1}, ${IMG_G2}`,
      mainImage: IMG_MAIN,
    })
  );

  const kitchenVariants = [{ type: 'Color', values: ['Steel|#C0C0C0', 'Matte Black|#1A1A1A'] }];
  const kitchenMaps = buildVariantMaps({
    variants: kitchenVariants,
    parentSku: 'GOV2TEST-004-KITCH-2499-SHAM-1499',
    regularPrice: 2499,
    salePrice: 1499,
    stocks: [15, 12],
    variantSkus: [
      'GOV2TEST-004-KITCH-2499-STEEL-SHAM-1499',
      'GOV2TEST-004-KITCH-2499-BLACK-SHAM-1499',
    ],
    variantMediaByKey: {
      'color:steel': {
        mainImage: IMG_VAR_A,
        galleryImages: [IMG_VAR_A, IMG_G1],
        video: '',
      },
      'color:matte black': {
        mainImage: IMG_VAR_B,
        galleryImages: [IMG_VAR_B, IMG_G2],
        video: '',
      },
    },
  });

  rows.push(
    baseRow({
      name: 'Gov2 Test Stainless Steel Lunch Box 3-Tier',
      sku: 'GOV2TEST-004-KITCH-2499-SHAM-1499',
      hasVariants: 'TRUE',
      regularPrice: 2499,
      salePrice: 1499,
      stock: kitchenMaps.totalStock,
      weight: 650,
      length: 18,
      width: 18,
      height: 12,
      weightClass: weightClassName,
      brand: 'LIFELONG',
      category: 'Kitchen',
      shortDesc: 'Leak-resistant 3-tier lunch box with color finishes.',
      longDesc: '<p>Insulated tiers keep meals fresh. Dishwasher-safe containers.</p>',
      variants: serializeComplex(kitchenVariants),
      variantPricing: serializeMixed(kitchenMaps.variantPricing),
      variantStock: serializeMixed(kitchenMaps.variantStock),
      variantSku: serializeMixed(kitchenMaps.variantSku),
      variantMedia: serializeMixed(kitchenMaps.variantMedia),
      tags: 'gov2test, lunchbox, kitchen',
      'seo.primaryKeyword': 'gov2test-lunchbox-004',
      metaTitle: 'Gov2 Test Lunch Box 3-Tier',
      galleryImages: IMG_G1,
      mainImage: IMG_MAIN,
      features: serializeComplex([
        { key: 'Tiers', value: '3 separate compartments' },
        { key: 'Material', value: 'Food-grade stainless steel' },
      ]),
    })
  );

  const accessVariants = [
    { type: 'Color', values: ['Black|#000000', 'White|#FFFFFF'] },
    { type: 'Size', values: ['S', 'M'] },
  ];
  const accessMaps = buildVariantMaps({
    variants: accessVariants,
    parentSku: 'GOV2TEST-005-ACCES-599-SHAM-0399',
    regularPrice: 599,
    salePrice: 399,
    stocks: [20, 18, 16, 14],
    variantSkus: [
      'GOV2TEST-005-ACCES-599-BLK-S-SHAM-0399',
      'GOV2TEST-005-ACCES-599-BLK-M-SHAM-0399',
      'GOV2TEST-005-ACCES-599-WHT-S-SHAM-0399',
      'GOV2TEST-005-ACCES-599-WHT-M-SHAM-0399',
    ],
  });

  rows.push(
    baseRow({
      name: 'Gov2 Test Fitness Resistance Band Set',
      sku: 'GOV2TEST-005-ACCES-599-SHAM-0399',
      hasVariants: 'TRUE',
      regularPrice: 599,
      salePrice: 399,
      stock: accessMaps.totalStock,
      weight: 320,
      weightClass: weightClassName,
      brand: 'JAYA',
      category: 'Accessories',
      shortDesc: 'Resistance bands with color and size options.',
      longDesc: '<p>Includes light, medium, and heavy bands with carry pouch.</p>',
      variants: serializeComplex(accessVariants),
      variantPricing: serializeMixed(accessMaps.variantPricing),
      variantStock: serializeMixed(accessMaps.variantStock),
      variantSku: serializeMixed(accessMaps.variantSku),
      variantMedia: serializeMixed(accessMaps.variantMedia),
      tags: 'gov2test, fitness, bands',
      'seo.primaryKeyword': 'gov2test-resistance-bands-005',
      metaTitle: 'Gov2 Test Resistance Band Set',
      galleryImages: `${IMG_G1}, ${IMG_G2}`,
      mainImage: IMG_MAIN,
      usageInstructions: serializeComplex([
        { title: 'Warm up', instruction: 'Perform 5 minutes of light stretching before use.' },
      ]),
    })
  );

  rows.push(
    baseRow({
      name: 'Gov2 Test Poetry Anthology Paperback',
      sku: 'GOV2TEST-006-BOOKS-199-SHAM-0139',
      regularPrice: 199,
      salePrice: 139,
      stock: 200,
      weight: 160,
      length: 20,
      width: 13,
      height: 1.5,
      weightClass: weightClassName,
      brand: 'NIKE',
      category: 'Books',
      subcategory: 'Fiction',
      shortDesc: 'Curated anthology of modern poetry for students.',
      longDesc: '<p>Paperback edition with author notes and reading guide.</p>',
      tags: 'gov2test, poetry, books',
      'seo.primaryKeyword': 'gov2test-poetry-book-006',
      metaTitle: 'Gov2 Test Poetry Anthology',
      metaDescription: 'Books category test row for v2 import.',
      galleryImages: IMG_G2,
      mainImage: IMG_MAIN,
      qandas: serializeComplex([
        { question: 'Language?', answer: 'English' },
        { question: 'Format?', answer: 'Paperback' },
      ]),
    })
  );

  return rows.map((row) => {
    const ordered = {};
    EXPORT_COLUMNS.forEach((col) => {
      let val = row[col];
      if (val === null || val === undefined || (typeof val === 'number' && isNaN(val))) {
        val = '';
      }
      ordered[col] = val;
    });
    return ordered;
  });
}

function rowsToCsv(rows) {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: EXPORT_COLUMNS });
  return XLSX.utils.sheet_to_csv(worksheet);
}

function parseCsvString(csv) {
  return new Promise((resolve, reject) => {
    const rows = [];
    Readable.from([csv])
      .pipe(csvParser())
      .on('data', (d) => rows.push(d))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function validateOutput(csv, sellerId) {
  const rawRows = await parseCsvString(csv);
  const contractVersion = getContractVersionFromRows(rawRows);
  const convertedRows = await convertProductRows(rawRows, sellerId);
  const legacyValidation = await validateProductRows(convertedRows, sellerId);
  const dbSkuSet = await loadGlobalSkuSet();
  const governance = validateRowsGovernance(convertedRows, contractVersion, dbSkuSet);

  const headerLine = csv.split(/\r?\n/)[0];
  const headerOk =
    headerLine.includes('weightClass') &&
    headerLine.includes('weight') &&
    OBSOLETE_EXPORT_COLUMNS.every((col) => !headerLine.split(',').includes(col));

  return {
    rawCount: rawRows.length,
    contractVersion,
    headerOk,
    legacyValidation,
    governance,
    columns: Object.keys(rawRows[0] || {}),
  };
}

async function resolveWeightClassNameForFixture() {
  const WeightClass = require('../models/WeightClass');
  const preferred = await WeightClass.findOne({
    name: { $regex: /^No Shipping Charge \(₹0\/-\)$/i },
    active: true,
  }).lean();
  if (preferred) return preferred.name;
  const anyActive = await WeightClass.findOne({ active: true }).sort({ sortOrder: 1 }).lean();
  if (!anyActive) {
    throw new Error('No active WeightClass found — create Shipping Slabs before generating gov2 CSV');
  }
  return anyActive.name;
}

async function main() {
  const outPath = path.join(__dirname, '..', '..', 'test_import_governance_v2_6products.csv');

  await mongoose.connect(process.env.MONGODB_URI);
  const weightClassName = await resolveWeightClassNameForFixture();
  const rows = buildProducts(weightClassName);
  const csv = rowsToCsv(rows);
  const sellerId = new mongoose.Types.ObjectId();
  const report = await validateOutput(csv, sellerId);
  await mongoose.disconnect();

  if (!report.headerOk) {
    console.error('Header does not match P6 product import/export contract');
    console.error('Got:', csv.split(/\r?\n/)[0]);
    process.exit(1);
  }

  if (!report.legacyValidation.isValid || !report.governance.isValid) {
    console.error('Validation failed');
    console.error('Legacy errors:', report.legacyValidation.errors);
    console.error('Governance errors:', report.governance.errors);
    process.exit(1);
  }

  fs.writeFileSync(outPath, csv, 'utf8');
  console.log('Wrote', outPath);
  console.log('Rows:', report.rawCount, 'contractVersion:', report.contractVersion);
  console.log('weightClass:', weightClassName);
  console.log('Warnings:', report.governance.warnings.length ? report.governance.warnings : 'none');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
