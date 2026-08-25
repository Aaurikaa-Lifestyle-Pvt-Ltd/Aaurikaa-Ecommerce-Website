const {
  legalEntityFromFooter,
  DEFAULT_LEGAL_ENTITY,
} = require('../../services/invoiceDownloadService');

describe('invoice legal entity', () => {
  it('uses AAURIKAA as the default legal name and does not invent GSTIN', () => {
    expect(legalEntityFromFooter({})).toEqual(DEFAULT_LEGAL_ENTITY);
    expect(DEFAULT_LEGAL_ENTITY.companyName).toBe('AAURIKAA Lifestyles Private Limited');
    expect(DEFAULT_LEGAL_ENTITY.gstin).toBe('');
  });

  it('reuses SiteSettings footer fields when present', () => {
    expect(
      legalEntityFromFooter({
        companyName: 'AAURIKAA Lifestyles Private Limited',
        gstin: '27AAAAA0000A1Z5',
        email: 'care@example.com',
        address: 'Mumbai',
        phone: '9999999999',
      })
    ).toMatchObject({
      companyName: 'AAURIKAA Lifestyles Private Limited',
      gstin: '27AAAAA0000A1Z5',
      email: 'care@example.com',
    });
  });
});
