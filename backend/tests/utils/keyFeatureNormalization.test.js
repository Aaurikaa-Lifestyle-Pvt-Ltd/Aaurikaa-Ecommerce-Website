const {
  parseFeaturesInput,
  normalizeFeaturesForWrite,
  getFeatureScalarValue,
  getFeatureValues,
} = require('../../utils/keyFeatureNormalization');
const { loadBaseline } = require('../../utils/keyFeatureCatalogueService');

describe('keyFeatureNormalization (1.7 — identity + multi-value)', () => {
  it('filters empty rows and trims key/value without rewriting keys', () => {
    const input = [
      { key: '  Brand  ', value: '  Acme  ' },
      { key: '', value: 'x' },
      { key: 'Size', value: '' },
      { key: 'Finish', value: 'Matte' },
      null,
    ];
    expect(normalizeFeaturesForWrite(input)).toEqual([
      { key: 'Brand', value: 'Acme' },
      { key: 'Finish', value: 'Matte' },
    ]);
  });

  it('parses JSON strings and empty values', () => {
    expect(parseFeaturesInput('')).toEqual([]);
    expect(parseFeaturesInput(undefined)).toEqual([]);
    expect(
      normalizeFeaturesForWrite(JSON.stringify([{ key: 'Weight', value: '1kg' }]))
    ).toEqual([{ key: 'Weight', value: '1kg' }]);
  });

  it('does not alias-rewrite Brand Name to Brand', () => {
    expect(
      normalizeFeaturesForWrite([{ key: 'Brand Name', value: 'Acme' }])
    ).toEqual([{ key: 'Brand Name', value: 'Acme' }]);
  });

  it('persists catalogue identity as code while keeping display key', () => {
    const fromEditor = [
      {
        catalogueCode: 'material.material',
        key: 'Material',
        value: 'Cotton',
      },
    ];
    expect(normalizeFeaturesForWrite(fromEditor)).toEqual([
      { key: 'Material', value: 'Cotton', code: 'material.material' },
    ]);
  });

  it('accepts inbound code and does not emit catalogueCode', () => {
    expect(
      normalizeFeaturesForWrite([
        { code: 'general-information.brand', key: 'Brand', value: 'Acme' },
      ])
    ).toEqual([{ key: 'Brand', value: 'Acme', code: 'general-information.brand' }]);
  });

  it('preserves existing Product keys on load/write round-trip', () => {
    const existing = [{ key: 'Weird Legacy Key', value: 'x' }];
    expect(normalizeFeaturesForWrite(existing)).toEqual(existing);
  });

  it('persists multi-value as values[] plus first value for compatibility', () => {
    expect(
      normalizeFeaturesForWrite([
        {
          code: 'cosmetics-multi-select.skin-type',
          key: 'Skin Type',
          values: ['Oily', 'Dry'],
        },
      ])
    ).toEqual([
      {
        key: 'Skin Type',
        value: 'Oily',
        code: 'cosmetics-multi-select.skin-type',
        values: ['Oily', 'Dry'],
      },
    ]);
  });

  it('does not split a free-entry value on commas', () => {
    expect(
      normalizeFeaturesForWrite([{ key: 'Material', value: 'Cotton, Polyester' }])
    ).toEqual([{ key: 'Material', value: 'Cotton, Polyester' }]);
  });

  it('does not emit duplicate rows for multi-select', () => {
    const out = normalizeFeaturesForWrite([
      { key: 'Skin Type', code: 'cosmetics-multi-select.skin-type', values: ['Oily', 'Dry'] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].values).toEqual(['Oily', 'Dry']);
  });

  it('reads scalar/display values from value or values[]', () => {
    expect(getFeatureScalarValue({ key: 'Pack Size', value: '500g' })).toBe('500g');
    expect(
      getFeatureScalarValue({ key: 'Pack Size', values: ['500g', '1kg'] })
    ).toBe('500g');
    expect(getFeatureValues({ value: 'Cotton' })).toEqual(['Cotton']);
    expect(getFeatureValues({ values: ['Oily', 'Dry'] })).toEqual(['Oily', 'Dry']);
  });
});

describe('keyFeatureCatalogueBaseline identity', () => {
  it('loads 519 entries with Brand alias and stable distinct codes', () => {
    const entries = loadBaseline();
    expect(entries).toHaveLength(519);
    const brand = entries.find((e) => e.displayLabel === 'Brand');
    expect(brand).toBeTruthy();
    expect(brand.aliases).toContain('Brand Name');
    expect(brand.code).toBe('general-information.brand');
    const domains = new Set(entries.map((e) => e.domain));
    expect(domains.size).toBe(22);
    expect(new Set(entries.map((e) => e.code)).size).toBe(519);
  });

  it('stores XLSX heuristic as candidateAllowedValues with unverified status', () => {
    const entries = loadBaseline();
    const withCandidates = entries.filter((e) => e.candidateAllowedValues.length > 0);
    expect(withCandidates.length).toBe(302);
    expect(
      withCandidates.every((e) => e.allowedValuesStatus === 'unverified_xlsx_shift')
    ).toBe(true);
    expect(withCandidates.every((e) => !e.allowedValues || e.allowedValues.length === 0)).toBe(
      true
    );
  });
});
