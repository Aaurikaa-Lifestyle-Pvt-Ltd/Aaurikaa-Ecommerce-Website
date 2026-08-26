import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("PDP mounts ProductReviews and hides marketplace seller review surfaces", () => {
  const page = read("app/products/[slug]/page.tsx");
  const reviews = read("components/product/product-reviews.tsx");
  assert.match(page, /ProductReviews/);
  assert.match(page, /productId=\{product\.id\}/);
  assert.match(page, /catalogueAvgRating=\{product\.avgRating\}/);
  assert.equal(/seller review|SellerReview|\/api\/reviews\/seller/i.test(reviews), false);
  assert.match(reviews, /fetchProductReviews/);
  assert.match(reviews, /customerReviews/);
  assert.match(reviews, /verifiedPurchase/);
  assert.match(reviews, /StarDisplay/);
});

test("static-page-view mounts EnquiryForm for contact and empty CMS care links", () => {
  const view = read("components/static-pages/static-page-view.tsx");
  assert.match(view, /EnquiryForm/);
  assert.match(view, /pageKey === "contact"/);
  assert.match(view, /href="\/contact"/);
  assert.match(view, /href="\/account\/orders"/);
  assert.match(view, /!ready && !contact/);
});

test("product-purchase wires Notify me for OOS via stock-notifications API", () => {
  const purchase = read("components/product/product-purchase.tsx");
  assert.match(purchase, /createStockNotification/);
  assert.match(purchase, /Notify me/);
  assert.match(purchase, /href="\/account"/);
  assert.match(purchase, /alreadyExists/);
  assert.match(purchase, /variantCombination/);
});

test("enquiry form posts contact enquiries without seller category", () => {
  const form = read("components/support/enquiry-form.tsx");
  assert.match(form, /submitContactEnquiry/);
  assert.equal(/category:\s*"seller"|value:\s*"seller"/i.test(form), false);
  assert.match(form, /enquiryNumber/);
  assert.match(form, /CONTACT_FIELD_LABELS/);
  assert.match(form, /orderInvoiceNumber/);
  assert.equal(form.includes("order_invoice"), false);
});
