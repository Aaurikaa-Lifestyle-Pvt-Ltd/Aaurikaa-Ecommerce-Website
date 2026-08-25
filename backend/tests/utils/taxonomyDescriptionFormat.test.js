const {
  isStructuredContent,
  normalizeTaxonomyDescriptionForStorage,
  formatTaxonomyDescriptionForExport,
  resetTaxonomyRichTextEngineForTests,
} = require('../../utils/taxonomyDescriptionFormat');

describe('taxonomyDescriptionFormat', () => {
  afterEach(() => {
    resetTaxonomyRichTextEngineForTests();
  });

  it('detects TipTap JSON strings', () => {
    const json = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(isStructuredContent(json)).toBe(true);
  });

  it('converts HTML to TipTap JSON', () => {
    const result = normalizeTaxonomyDescriptionForStorage('<p>Hello <strong>world</strong></p>');
    expect(isStructuredContent(result)).toBe(true);
    const parsed = JSON.parse(result);
    expect(parsed.type).toBe('doc');
    expect(parsed.content.length).toBeGreaterThan(0);
  });

  it('wraps plain text as paragraph nodes', () => {
    const result = normalizeTaxonomyDescriptionForStorage('Line one\n\nLine two');
    const parsed = JSON.parse(result);
    expect(parsed.content).toHaveLength(2);
  });

  it('skips re-normalizing existing TipTap JSON', () => {
    const input = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Already JSON' }] }],
    });
    const result = normalizeTaxonomyDescriptionForStorage(input);
    expect(JSON.parse(result).content[0].content[0].text).toBe('Already JSON');
  });

  it('exports TipTap JSON as HTML and passes legacy HTML through', () => {
    const json = normalizeTaxonomyDescriptionForStorage('<p>Export me</p>');
    const html = formatTaxonomyDescriptionForExport(json);
    expect(html).toMatch(/<p>/);
    expect(formatTaxonomyDescriptionForExport('<p>Legacy</p>')).toBe('<p>Legacy</p>');
  });

  it('round-trips HTML export → import with consistent paragraph count', () => {
    const source = '<p>First</p><p>Second</p>';
    const stored = normalizeTaxonomyDescriptionForStorage(source);
    const exported = formatTaxonomyDescriptionForExport(stored);
    const reimported = normalizeTaxonomyDescriptionForStorage(exported);
    const before = JSON.parse(stored).content.filter((n) => n.type === 'paragraph').length;
    const after = JSON.parse(reimported).content.filter((n) => n.type === 'paragraph').length;
    expect(after).toBe(before);
  });
});
