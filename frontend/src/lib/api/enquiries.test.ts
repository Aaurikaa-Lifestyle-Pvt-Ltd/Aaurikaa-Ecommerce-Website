import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildContactEnquiryPayload,
  buildWellWisherEnquiryPayload,
  validateContactEnquiryInput,
  validateWellWisherEnquiryInput,
} from "./enquiries-payload.ts";

test("contact enquiry payload uses contact source and omits seller category", () => {
  const payload = buildContactEnquiryPayload({
    subject: "Order help",
    message: "I need help with my recent order details.",
    submitter: { email: "guest@example.com", name: "Guest", phone: "9999999999" },
    category: "support",
  });
  assert.equal(payload.source, "contact");
  assert.equal(payload.subject, "Order help");
  assert.equal(payload.category, "support");
  assert.deepEqual(payload.submitter, {
    email: "guest@example.com",
    name: "Guest",
    phone: "9999999999",
  });

  const sellerAttempt = buildContactEnquiryPayload({
    subject: "Hello",
    message: "Long enough message here.",
    submitter: { email: "a@b.co" },
    category: "seller" as never,
  });
  assert.equal(sellerAttempt.category, undefined);
});

test("well-wisher payload uses well-wisher source and required category", () => {
  const payload = buildWellWisherEnquiryPayload({
    message: "Please add more wedding sets to the catalogue soon.",
    category: "feature",
    submitter: { email: "fan@example.com", name: "Asha", anonymous: true },
    rating: 5,
  });
  assert.equal(payload.source, "well-wisher");
  assert.equal(payload.category, "feature");
  assert.equal(payload.rating, 5);
  assert.deepEqual(payload.submitter, {
    email: "fan@example.com",
    name: "Asha",
    anonymous: true,
  });
  assert.equal("seller" in payload, false);
});

test("validation rejects incomplete contact and well-wisher inputs", () => {
  assert.match(
    String(
      validateContactEnquiryInput({
        subject: "",
        message: "short",
        submitter: { email: "bad" },
      }),
    ),
    /Subject|Message|email/i,
  );
  assert.equal(
    validateWellWisherEnquiryInput({
      message: "This is a long enough well-wisher message.",
      category: "experience",
      submitter: { email: "ok@example.com" },
    }),
    null,
  );
  assert.match(
    String(
      validateWellWisherEnquiryInput({
        message: "Too short",
        category: "seller" as never,
        submitter: { email: "ok@example.com" },
      }),
    ),
    /category/i,
  );
});

test("enquiries client posts to /api/enquiries with optional auth", () => {
  const text = fs.readFileSync(path.join(import.meta.dirname, "enquiries.ts"), "utf8");
  assert.match(text, /\/api\/enquiries/);
  assert.match(text, /source:\s*"contact"|buildContactEnquiryPayload/);
  assert.match(text, /well-wisher|buildWellWisherEnquiryPayload/);
  assert.match(text, /getShopperToken/);
  assert.match(text, /enquiryNumber/);
  assert.match(text, /submitWellWisherEnquiry/);
  assert.equal(/category:\s*"seller"/i.test(text), false);
});

test("support forms mount on static pages and avoid seller category", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const view = fs.readFileSync(
    path.join(root, "components/static-pages/static-page-view.tsx"),
    "utf8",
  );
  const well = fs.readFileSync(
    path.join(root, "components/support/well-wisher-form.tsx"),
    "utf8",
  );
  const payload = fs.readFileSync(
    path.join(import.meta.dirname, "enquiries-payload.ts"),
    "utf8",
  );
  assert.match(view, /EnquiryForm/);
  assert.match(view, /WellWisherForm/);
  assert.match(view, /well-wisher-suggestions/);
  assert.equal(/seller/i.test(well), false);
  assert.equal(payload.includes('"seller"'), false);
});
