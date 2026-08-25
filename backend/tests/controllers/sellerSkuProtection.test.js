const fs = require('fs');
const path = require('path');

describe('seller SKU protection', () => {
  it('strips sku from seller updateProduct payload', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../controllers/sellerProductController.js'),
      'utf8'
    );

    expect(source).toMatch(/delete cleanBody\.sku;\s*\/\/ Phase 4: SKU is read-only for sellers/);
    expect(source).not.toMatch(/synchronizeSkuChange/);
  });
});
