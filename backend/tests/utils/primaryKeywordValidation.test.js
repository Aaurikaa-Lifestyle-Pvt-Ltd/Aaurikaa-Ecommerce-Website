const {
  KEYWORD_REQUIRED_MESSAGE,
  KEYWORD_TITLE_MESSAGE,
  KEYWORD_DESCRIPTION_MESSAGE,
  titleStartsWithKeyword,
  descriptionContainsKeyword,
  assertPrimaryKeywordPlacement,
  mergePrimaryKeywordIntoSeo,
} = require('../../utils/primaryKeywordValidation');

describe('primaryKeywordValidation', () => {
  describe('titleStartsWithKeyword (T1)', () => {
    it('matches case-insensitive prefix after whitespace collapse', () => {
      expect(titleStartsWithKeyword('  Cotton Yoga Mat Large ', 'cotton  yoga mat')).toBe(true);
    });

    it('rejects when the title only contains the keyword later', () => {
      expect(titleStartsWithKeyword('Large Cotton Yoga Mat', 'cotton yoga mat')).toBe(false);
    });
  });

  describe('descriptionContainsKeyword (D1 shortDesc)', () => {
    it('matches substring in plain text', () => {
      expect(descriptionContainsKeyword('Buy a Cotton Yoga Mat today', 'cotton yoga mat')).toBe(true);
    });

    it('strips HTML before matching', () => {
      expect(
        descriptionContainsKeyword('<p>Our <strong>Cotton Yoga Mat</strong> is thick.</p>', 'cotton yoga mat')
      ).toBe(true);
    });

    it('strips TipTap JSON before matching', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'The Cotton Yoga Mat is non-slip.' }],
          },
        ],
      };
      expect(descriptionContainsKeyword(JSON.stringify(doc), 'cotton yoga mat')).toBe(true);
    });

    it('rejects when the keyword is absent', () => {
      expect(descriptionContainsKeyword('A great product for yoga.', 'cotton yoga mat')).toBe(false);
    });
  });

  describe('assertPrimaryKeywordPlacement', () => {
    const valid = {
      name: 'Cotton Yoga Mat 6mm',
      shortDesc: 'Cotton Yoga Mat with extra grip.',
      seo: { primaryKeyword: 'Cotton Yoga Mat' },
    };

    it('passes when title starts with keyword and shortDesc contains it', () => {
      expect(() => assertPrimaryKeywordPlacement(valid)).not.toThrow();
    });

    it('requires a keyword', () => {
      expect(() =>
        assertPrimaryKeywordPlacement({ name: 'Cotton Yoga Mat', shortDesc: 'Cotton Yoga Mat' })
      ).toThrow(KEYWORD_REQUIRED_MESSAGE);
    });

    it('requires the title to start with the keyword', () => {
      expect(() =>
        assertPrimaryKeywordPlacement({
          ...valid,
          name: 'Premium Cotton Yoga Mat',
        })
      ).toThrow(KEYWORD_TITLE_MESSAGE);
    });

    it('requires the keyword in shortDesc only (not longDesc)', () => {
      expect(() =>
        assertPrimaryKeywordPlacement({
          ...valid,
          shortDesc: 'A comfortable mat.',
          longDesc: 'Cotton Yoga Mat details here.',
        })
      ).toThrow(KEYWORD_DESCRIPTION_MESSAGE);
    });

    it('skips shortDesc (D1) when requireShortDesc is false (admin path)', () => {
      expect(() =>
        assertPrimaryKeywordPlacement(
          {
            name: 'Cotton Yoga Mat 6mm',
            shortDesc: '',
            seo: { primaryKeyword: 'Cotton Yoga Mat' },
          },
          { requireShortDesc: false }
        )
      ).not.toThrow();
    });

    it('still requires T1 when requireShortDesc is false', () => {
      expect(() =>
        assertPrimaryKeywordPlacement(
          {
            name: 'Premium Cotton Yoga Mat',
            shortDesc: '',
            seo: { primaryKeyword: 'Cotton Yoga Mat' },
          },
          { requireShortDesc: false }
        )
      ).toThrow(KEYWORD_TITLE_MESSAGE);
    });

    it('central SEO placement rules remain available for non-admin callers', () => {
      expect(KEYWORD_REQUIRED_MESSAGE).toMatch(/required/i);
      expect(KEYWORD_TITLE_MESSAGE).toMatch(/start of the product title/i);
      expect(KEYWORD_DESCRIPTION_MESSAGE).toMatch(/short description/i);
    });
  });

  describe('mergePrimaryKeywordIntoSeo (autosave / Phase 4)', () => {
    it('maps flat primaryKeyword onto seo and removes the flat field', () => {
      const updateData = { primaryKeyword: ' cotton shirt ', name: 'Cotton Shirt' };
      mergePrimaryKeywordIntoSeo(updateData);
      expect(updateData.primaryKeyword).toBeUndefined();
      expect(updateData.seo).toEqual({ primaryKeyword: 'cotton shirt' });
    });

    it('prefers flat primaryKeyword over a stale seo.primaryKeyword', () => {
      const updateData = {
        primaryKeyword: 'new keyword',
        seo: { primaryKeyword: 'old keyword', other: true },
      };
      mergePrimaryKeywordIntoSeo(updateData);
      expect(updateData.seo).toEqual({ primaryKeyword: 'new keyword', other: true });
    });

    it('is a no-op when no keyword fields are present', () => {
      const updateData = { name: 'Only Name' };
      mergePrimaryKeywordIntoSeo(updateData);
      expect(updateData).toEqual({ name: 'Only Name' });
    });
  });
});
