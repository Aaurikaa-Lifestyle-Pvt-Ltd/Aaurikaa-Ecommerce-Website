import assert from "node:assert/strict";
import test from "node:test";
import {
  errorReportCsv,
  issueFromMessage,
  issuesFromUnknown,
  suggestedFixFor,
} from "./catalogue-import-errors.ts";

test("parses row-prefixed product validation messages into operator issues", () => {
  const issue = issueFromMessage("Row 4: Product name is required");
  assert.equal(issue.row, 4);
  assert.equal(issue.field, "name");
  assert.match(issue.suggestedFix, /required/i);
});

test("maps category hierarchy and SKU conflicts to suggested fixes", () => {
  assert.match(suggestedFixFor('parentCategory is required for subcategory rows'), /parent category/i);
  assert.match(suggestedFixFor('SKU "AUR-1" already exists in the database'), /Update existing/i);
  assert.match(suggestedFixFor("Shipping Slab is required."), /Shipping Slab/i);
  assert.match(
    suggestedFixFor("Shipping Slab name not found."),
    /No Shipping Charge/i,
  );
});

test("flattens mixed backend error payloads without exposing raw driver text as the only field", () => {
  const issues = issuesFromUnknown([
    "Row 2: Category \"New Arrivals\" not found. Please use a valid category name, slug, or ObjectId",
    { row: 5, message: "Duplicate category slug \"earrings\"" },
    { rowIndex: 3, errors: ["Row 3: variantStock missing for combination \"size:m\""] },
  ]);
  assert.equal(issues.length, 3);
  assert.equal(issues[0].field, "category");
  assert.equal(issues[1].row, 5);
  assert.equal(issues[1].field, "slug");
  assert.equal(issues[2].field, "stock");
  assert.equal(errorReportCsv(issues).split("\n")[0], "Row,Field,Problem,Suggested Fix");
});
