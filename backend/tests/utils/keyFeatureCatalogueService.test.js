const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');
const KeyFeatureCatalogue = require('../../models/KeyFeatureCatalogue');
const {
  loadBaseline,
  listActiveCatalogueEntries,
  seedCatalogueFromBaseline,
  getCatalogueCount,
  toPublicCatalogueEntry,
} = require('../../utils/keyFeatureCatalogueService');

describe('keyFeatureCatalogueService (Phase 3 correction)', () => {
  let mongoServer;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await KeyFeatureCatalogue.deleteMany({});
  });

  it('GET/list does not mutate Mongo when catalogue is empty', async () => {
    expect(await getCatalogueCount()).toBe(0);
    const list = await listActiveCatalogueEntries();
    expect(list).toEqual([]);
    expect(await getCatalogueCount()).toBe(0);
  });

  it('explicit seed loads 519 entries and list returns public candidate shape', async () => {
    const result = await seedCatalogueFromBaseline();
    expect(result.total).toBe(519);

    const list = await listActiveCatalogueEntries();
    expect(list).toHaveLength(519);
    expect(list[0]).toHaveProperty('code');
    expect(list[0]).toHaveProperty('featureIdentity', list[0].code);
    expect(list[0]).toHaveProperty('displayLabel');
    expect(list[0]).toHaveProperty('candidateAllowedValues');
    expect(list[0]).toHaveProperty('allowedValuesStatus');
    expect(list[0].allowedValues).toBeUndefined();
  });

  it('keeps distinct codes for duplicate display labels (Material)', async () => {
    await seedCatalogueFromBaseline();
    const list = await listActiveCatalogueEntries();
    const materials = list.filter((e) => e.displayLabel === 'Material');
    expect(materials.length).toBeGreaterThan(1);
    const codes = materials.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(
      expect.arrayContaining([
        'material.material',
        'kids-toys.material',
        'product-form.material',
      ])
    );
  });

  it('does not treat displayLabel as globally unique in baseline', () => {
    const entries = loadBaseline();
    const byLabel = {};
    for (const e of entries) {
      byLabel[e.displayLabel] = (byLabel[e.displayLabel] || 0) + 1;
    }
    const dupLabels = Object.values(byLabel).filter((n) => n > 1);
    expect(dupLabels.length).toBeGreaterThan(0);
    expect(new Set(entries.map((e) => e.code)).size).toBe(entries.length);
  });

  it('maps heuristic lists only as unverified candidates', async () => {
    await seedCatalogueFromBaseline();
    const withCandidates = await KeyFeatureCatalogue.findOne({
      candidateAllowedValues: { $exists: true, $ne: [] },
    }).lean();
    expect(withCandidates).toBeTruthy();
    expect(withCandidates.allowedValuesStatus).toBe('unverified_xlsx_shift');
    expect(withCandidates.allowedValues || []).toEqual([]);

    const pub = toPublicCatalogueEntry(withCandidates);
    expect(pub.candidateAllowedValues.length).toBeGreaterThan(0);
    expect(pub.allowedValuesStatus).toBe('unverified_xlsx_shift');
    expect(pub.allowedValues).toBeUndefined();
  });

  it('legacy allowedValues docs surface as candidates in public DTO', () => {
    const pub = toPublicCatalogueEntry({
      code: 'design.finish',
      displayLabel: 'Finish',
      domain: '5. Design',
      domainSlug: 'design',
      aliases: [],
      allowedValues: ['Matte', 'Glossy'],
      candidateAllowedValues: [],
      sortOrder: 1,
    });
    expect(pub.candidateAllowedValues).toEqual(['Matte', 'Glossy']);
    expect(pub.allowedValuesStatus).toBe('unverified_xlsx_shift');
  });
});

describe('Compare Scope 5 compatibility (unchanged)', () => {
  it('compare.js still matches features by display-label key equality', () => {
    const comparePath = path.join(
      __dirname,
      '../../../frontend/pages/compare.js'
    );
    const src = fs.readFileSync(comparePath, 'utf8');
    expect(src).toMatch(/features\.map\(\s*f\s*=>\s*f\.key\s*\)/);
    expect(src).toMatch(/f\.key\s*===\s*feature/);
    expect(src).not.toMatch(/catalogueCode|featureIdentity|featureId/);
  });
});
