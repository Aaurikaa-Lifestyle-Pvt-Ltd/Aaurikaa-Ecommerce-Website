const { isStructuredContent, validateStructuredContent } = require('../../utils/contentGovernance');

const isValidLength = (value, minLength, maxLength) => {
  if (typeof value !== 'string') return false;
  const len = value.length;
  return len >= minLength && len <= maxLength;
};

// Mirror of taxonomyDescriptionValidation in middleware/validation.js
function taxonomyDescriptionValidation(value) {
  if (!value) return true;
  if (isStructuredContent(value)) {
    return validateStructuredContent(JSON.parse(value), 'CMS');
  }
  return isValidLength(value, 0, 20000);
}

function assertValid(result) {
  if (result === true) return;
  if (result === false) throw new Error('expected valid');
  if (result && result.isValid === false) throw new Error(result.errors?.join('; ') || 'invalid');
}

function assertInvalid(result) {
  if (result === false) return;
  if (result && result.isValid === false) return;
  throw new Error('expected invalid');
}

describe('taxonomyDescriptionValidation', () => {
  it('accepts valid TipTap JSON in CMS context', () => {
    const description = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Valid' }] }],
    });
    assertValid(taxonomyDescriptionValidation(description));
  });

  it('accepts legacy HTML within length limits', () => {
    assertValid(taxonomyDescriptionValidation('<p>Legacy HTML</p>'));
  });

  it('accepts legacy blocks JSON (migration compatibility)', () => {
    const description = JSON.stringify({ blocks: [] });
    assertValid(taxonomyDescriptionValidation(description));
  });

  it('rejects invalid TipTap doc content', () => {
    const description = JSON.stringify({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 99 }, content: [{ type: 'text', text: 'Bad' }] }],
    });
    assertInvalid(taxonomyDescriptionValidation(description));
  });
});
