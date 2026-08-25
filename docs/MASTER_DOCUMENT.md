# ANBAZAR Multi‑Vendor E‑Commerce Platform

## Master Implementation Documentation & Development Context

Prepared For Future Development Continuity  
Prepared By: IMAGINEAIRY PHOTOGRAPHICS PVT. LTD.  
Project Type: Multi‑Vendor E‑Commerce Marketplace Platform  
Current Status: Post-Scope-5 baseline — Scope 5 completed with documented exceptions (see §27). Historical stabilization, SEO, shipping, taxation, seller management, and product-engine work remain in force.

---

## 1. Purpose of This Document

This document consolidates all completed scopes, architectural decisions, feature implementations, workflow stabilizations, UI/UX enhancements, integrations, and business logic already implemented in the ANBAZAR Multi‑Vendor E‑Commerce Platform.

The current engineering baseline includes **Scope 5**, as audited in `SCOPE_5_COMPLETION_REPORT.md` against `SCOPE_5_IMPLEMENTATION_BASELINE.md`. The signed Scope 5 PDF remains the contractual source for originally agreed requirements. The Completion Report is the repository audit of what is actually implemented. Scope 5 is **not** gap-free; exceptions are recorded in §27.12.

The objective of this document is to:

- Prevent duplicate implementation.
- Maintain continuity for future development.
- Preserve business logic decisions.
- Ensure future scopes remain aligned with the existing architecture.
- Help AI assistants, developers, project managers, and technical analysts understand the exact current state of the platform.
- Reduce hallucination and assumption during future requirement analysis.

This document should always be referenced before:

- Adding new features.
- Modifying workflows.
- Refactoring modules.
- Performing technical audits.
- Creating new scopes.
- Debugging existing logic.

---

## 2. Platform Overview

The platform is a full-scale Multi‑Vendor E‑Commerce Marketplace supporting:

- Admin management.
- Seller onboarding.
- Shopper ordering workflows.
- Product catalogue management.
- Variant management.
- GST taxation.
- Shipping zone logic.
- Coupon and offer systems.
- Blog and CMS management.
- SEO management.
- Multi-language support.
- Subscription management.
- Mobile-responsive shopping experience.
- Product import/export.
- Payment gateway integration.
- Logistics integration.
- After-Sales Management (Need Help / seller review / admin governance).
- Shopper Wallet **credit** for After-Sales refunds (checkout redemption is not implemented).
- Admin operational RBAC (view/manage).
- Global storefront search across product and taxonomy dimensions.
- Career Management (public module is environment-flagged).

---

## 3. Core Architectural Stabilization Already Completed

### 3.1 Frontend Stabilization

**Completed:**

- Removed hardcoded/demo data from multiple frontend modules.
- Converted UI rendering to API-driven dynamic content.
- Improved responsive behavior across mobile/tablet/desktop.
- Fixed inconsistent frontend rendering logic.
- Improved navigation behavior.
- Fixed multiple routing mismatches.
- Stabilized checkout/cart rendering.
- Improved product detail rendering.

**Important Notes:**

- Frontend logic now expects backend-driven content.
- Future modules must avoid hardcoded placeholders.
- All future UI implementations must remain responsive.

---

### 3.2 Backend Stabilization

**Completed:**

- Authentication corrections.
- Checkout lifecycle stabilization.
- Product workflow stabilization.
- Coupon logic corrections.
- Invoice business logic corrections.
- Validation improvements.
- SKU uniqueness enforcement.
- Environment-based configuration migration.

**Important Constraints:**

- Future implementations must follow validation-first architecture.
- Environment variables must be used instead of hardcoded values.
- Business logic should remain backend-controlled.

---

## 4. Security & Validation Corrections Implemented

### Completed Security Corrections

- Added validation layers across forms.
- Strengthened registration flow validation.
- Strengthened product add/edit validation.
- Stabilized checkout validations.
- Improved SKU validation.
- Reduced frontend exposure of sensitive values.
- Removed hardcoded URLs from frontend.
- Improved role-based workflow handling.

### Remaining Architectural Principle

All future modules must:

- Validate at backend level.
- Never trust frontend input.
- Avoid frontend business-rule enforcement.
- Avoid exposing secrets/API values in client-side code.

---

## 5. Product Engine — Implemented Features

### 5.1 Product Schema Upgrade

**Implemented:**

- HSN code support.
- SEO fields:
  - Meta Title
  - Meta Description
  - Keywords
  - Intro
- Tax configuration fields.
- Inclusive/exclusive tax support.
- Product-level shipping method selection.
- Product video support.

### 5.2 Product Feature Sections Enhancement

**Implemented:**

Rich Text Editor support added for:

- Key Features
- Usage & Safety

**Integrated With:**

- Admin product add/edit.
- Seller product add/edit.
- Product import/export.
- Frontend product rendering.

### 5.3 Advanced Variant Engine

**Implemented:**

- Multi-dimensional variants.
- Variant-specific pricing.
- Size × Color combinations.
- Variant-level stock.
- Variant-specific images.
- Color palette selector.
- Color label support.
- Improved variation UX.

### 5.4 Product Detail Page Enhancements

**Implemented:**

- Related Products.
- More Products.
- Seller Information Box.
- How to Use section.
- SKU display.
- HSN display.
- Tax information display.
- Stock information display.
- Variation display.
- Internal link embedding.
- CTA support inside descriptions.

**Scope 5 merchandising (completed):**

- Related Products, Bought Together, Upsell, and Cross-Sell presented as single-row responsive carousels on the product detail page.
- Product card actions: Wishlist, Quick View, Compare.
- Related products resolve via category/tags/SKU fallback (not a dedicated related-SKU field).
- Visual image-visibility quality beyond the implemented square-image card treatment: **Unable to verify from the current repository evidence.**

### 5.5 Enterprise Rich Text Editor

**Implemented:**

- Advanced editor replacing basic Quill workflows.
- SEO-friendly heading support.
- Table insertion.
- ALT text support.
- Internal/external links.
- Button insertion.
- Image resize/alignment.
- Structured content sections.

**Applies To:**

- Product content.
- Blog content.
- CMS pages.

### 5.6 SKU System

**Implemented:**

- Pattern-based SKU generation.
- SKU settings page.
- Auto-generated SKU.
- Unique SKU enforcement.

**Pattern Components:**

- CAT5
- NL9
- QT2
- PK4
- WT2
- BRD5
- SLR5
- RP4
- SP4

### 5.7 Auto Draft System

**Implemented:**

- Auto-save drafts.
- Draft/Published/Trash workflow.
- Draft restore functionality.

**Applies To:**

- Products.
- Blogs.

### 5.8 Product Primary Keyword Validation (Scope 5)

**Implemented:**

- Advisory primary-keyword availability checking during:
  - Admin product creation and editing.
  - Seller product creation and editing.
- Visual availability indication on product forms.
- Early duplicate detection that does **not** replace publish-time enforcement.

**Authoritative rule:**

Final **publish-time uniqueness validation** remains the authoritative primary-keyword control. The advisory check must not be treated as the final validation mechanism.

Import/bulk-upload does not fail the import job solely on duplicate keyword; uniqueness continues to be enforced at publish.

---

## 6. Product Brand System

### Implemented Enhancements

#### Brand Selection

**Implemented:**

- Dropdown brand selection.
- Manual brand input.
- Autocomplete suggestions.
- Search-based brand matching.
- Dynamic seller-side brand creation.

#### Brand Management

**Implemented:**

- Optional brand logo/image.
- Show/Hide visibility toggle.
- Flexible admin brand management.

**Important Rule:**

Brand image is optional and must remain optional in future changes.

---

## 7. Product Color & Variant UX

**Implemented:**

- Color palette selector.
- Text label alongside colors.
- Improved variant management UI.
- Improved selection workflow.

**Applies To:**

- Admin product forms.
- Seller product forms.
- Frontend variation selection.

---

## 8. Cart, Checkout & Order Workflow

### Implemented Fixes

#### Cart Stabilization

- Buy Now cart clearing fix.
- Smooth quantity update.
- Inline remove button.
- Subtotal placement correction.
- Product click redirects to product detail page.

#### Coupon System

**Implemented:**

- Coupon apply stabilization.
- Coupon business logic integration.
- Checkout integration.
- Validation improvements.

#### Checkout UX

**Implemented:**

- Checkout UI/UX baseline enhancement.
- Responsive improvements.
- Better order flow stabilization.

**Important Business Rule:**

Subtotal must appear between product section and remove button.

**Shopper Wallet (current boundary):**

Shopper Wallet is **not** a checkout payment method. After-Sales refunds may credit wallet balance and history. Checkout redemption of wallet balance is **not currently implemented**. Do not assume shoppers can spend wallet funds during checkout.

---

## 9. Review, Comment & Rating System

### Implemented Features

#### Shopper Reviews

- Login-required reviews.
- Comment support.
- Rating support.

#### Seller Reviews

- One-time review.
- Editable review.

#### Admin Reviews

- One-time review.
- Editable review.

#### Rating Visibility

**Implemented:**

- Product rating under price.
- Seller rating beside seller name.

#### Permanent Rating Persistence

**Critical Locked Business Rule:**

- Ratings persist even if product is removed.
- Product deletion must not destroy historical ratings.
- Seller ratings must remain historically preserved.

---

## 10. Mobile Navigation & Responsive UI

**Implemented Improvements:**

- Hamburger menu fixes.
- Category menu scroll fixes.
- Mobile search fixes.
- Header search (desktop and mobile) uses the Scope 5 global search dimensions described in §27.7. Visual mobile QA: **Unable to verify from the current repository evidence.**
- Mobile icon visibility improvements.
- Bottom navigation added.
- Mobile header enhancement.
- Registration UI improvements.
- Password guideline support.
- Upload instruction support.
- Tags page responsive layout correction.

**Bottom Navigation Includes:**

- Home
- Shop
- Account
- More

---

## 11. Error Handling & Maintenance System

**Implemented:**

- Custom 404 page.
- Custom 403 page.
- Custom 500 page.
- Maintenance/shutdown noticeboard.
- System fallback handling.

---

## 12. Import / Export Engine

### Implemented Features

#### Export System

- CSV export.
- Excel export.
- Proper formatting.
- Header mapping.
- Image URL export.
- Video URL export.
- Category mapping.
- Tag mapping.

#### Import System

- Full import mapping.
- Category mapping.
- Gallery mapping.
- Video mapping.
- Tag mapping.
- Validation improvements.
- Pending admin approval flow.

#### Approval Workflow

**Implemented:**

- Waiting-for-approval list.
- Detail view.
- Controlled publishing.

#### Category / taxonomy import-export (Scope 5)

Category-related import and export support image, description, FAQ, tax/commission, and mega-menu fields where those fields exist on the taxonomy models. See §27.8 for content-field exceptions (no separate extended-description field; listing-column gaps).

---

## 13. Media Gallery System

**Implemented:**

- Image upload.
- Video upload.
- File rename.
- ALT text support.
- Media deletion.
- Media modification.
- Copy URL support.

---

## 14. Shipping Engine

### 14.1 Shipping Zones & Weight Classes

**Implemented:**

- Shipping zones.
- Weight classes.
- Flat shipping rules.
- Free shipping rules (global / minimum-order and zone-oriented rules, plus coupon free-shipping).
- Conditional free shipping.
- Form UX improvements.

**Scope 5 Point D — catalog-level free shipping (not implemented as specified):**

Signed Scope 5 required configurable free-shipping eligibility at Product, Category, Subcategory, and Child Category. The current repository does **not** implement those catalog-level eligibility flags. Free shipping continues to be governed by the existing shipping-engine rules and coupon `freeShipping` behavior. Do not document or assume product/taxonomy free-shipping flags as complete. Future direction for catalog-level eligibility is an **open boundary**, not a decision recorded here.

### 14.2 Shipping Logic Engine

**Implemented:**

- Weight-based logic.
- Sale-price eligibility logic.
- Conditional free shipping.
- Flat shipping fallback.
- Address/pincode zone detection.

**Supported Zone Types:**

- Local
- In-State
- Out-of-State
- Union Territory

**Important Logic Principle:**

Shipping must always resolve through zone → condition → fallback hierarchy.

### 14.3 Shiprocket Integration

**Implemented:**

- Shiprocket API integration.
- Order synchronization.
- Shipping charge fetch.
- Delivery status tracking.

---

## 15. GST Tax Engine

**Implemented Features:**

- CGST calculation.
- SGST calculation.
- UGST calculation.
- Category-based tax percentage.
- Product-level tax display.
- Inclusive tax logic.
- Exclusive tax logic.
- Savings calculation.
- Checkout tax breakdown.

**Important Rules:**

- Tax logic must remain centralized.
- Inclusive/exclusive tax modes are both supported.
- Product display and checkout must remain synchronized.

---

## 16. Seller Management & Financial System

### 16.1 Commission System

**Implemented:**

- Category-wise commission.
- Seller-wise commission.
- Admin override.
- Automatic commission deduction.

### 16.2 Seller Payouts

**Implemented:**

- Pending/completed payout tabs.
- Earnings visibility.
- Commission visibility.
- Net earnings calculation.
- Admin approval workflows.

### 16.3 Seller Profile & Banking

**Implemented:**

- Shop name display.
- Seller name display.
- UPI ID support.
- Branch support.
- State support.
- Country support.
- Mobile number support.
- Bank account confirmation validation.

**Critical Business Rule:**

Bank account number must be entered twice and validated for confirmation.

---

## 17. Payment Gateway Integration

### PhonePe Integration

**Implemented:**

- PhonePe payment gateway.
- Merchant API setup.
- Payment workflow integration.

**Important Future Constraint:**

All future payment integrations must follow environment-based credential management.

**Shopper Wallet is not a payment gateway and is not a checkout tender.** See §27.4.

---

## 18. Blog & SEO System

### Blog System

**Implemented:**

- Multi-category support.
- SEO fields.
- Tag separator fixes.
- SEO tooltip helper.
- Improved image handling.
- Blog detail routing stabilization.
- Slug synchronization fixes.

### SEO System

**Implemented:**

- Meta title.
- Meta description.
- Keywords.
- Structured SEO support.

**Locked SEO Decision:**

Blog SEO writing guidelines and structured SEO fields are officially aligned with Objective 4.7 implementation.

---

## 19. CMS & Global Content Management

### CMS Pages

**Implemented:**

- Create CMS pages.
- Edit CMS pages.
- Delete CMS pages.
- Draft/Publish/Trash workflow.

**Editable Pages Include:**

- About
- Contact
- Policies
- Terms & Conditions

### Seller Knowledge Base (Scope 5)

Seller-facing CMS pages are in the current baseline:

- Seller FAQ
- Seller Help Center
- Seller Training

These use the existing CMS/static-page architecture, including link cards and video **URL** fields. They are not a separate knowledge-base product and not a media-library video host.

Shopper `/help-center` is a distinct page and must not be confused with the seller knowledge-base pages.

---

## 20. Footer, Header & Branding

### Footer System

**Implemented:**

- Footer column settings.
- Footer links.
- Footer text.
- Payment image support.
- Social image support.
- Footer styling fixes.
- Dynamic copyright auto-update.

### Header & Branding

**Implemented:**

- Logo management.
- Favicon management.
- Title management.
- Tagline management.
- Header navigation management.
- Mega menu builder.

**Mega Menu Supports:**

- Categories.
- Images.
- Ordering.

**Scope 5 — Admin Settings (scripts and colors):**

Scripts Management and Website Color Settings save/update workflows are wired; storefront applies configured scripts and theme colors. Runtime save/render success in a live browser: **Unable to verify from the current repository evidence.**

**Scope 5 — Category navigation active state:**

Top category navigation and mega menu highlight the active category (and subcategory/child where the URL path supports it) during category browsing.

**Scope 5 — Storefront account navigation:**

Admin Login is removed from storefront account navigation. Shopper Login and Seller Login remain. Administrators access the admin panel through the direct administrative route (for example `/admin/login`).

**Header title/tagline hover (Scope 5 Point E):**

Code-level layout mitigation exists on the header brand/tagline hover treatment. Runtime browser verification that hover instability is fully resolved: **Unable to verify from the current repository evidence.**

---

## 21. Shop Page Sidebar System

**Implemented:**

- Sidebar banner controls.
- Heading controls.
- Shop-related settings.

Admin-Controlled.

---

## 22. Subscription System

**Implemented:**

- Subscription email collection.
- Validation.
- Database persistence.
- Admin subscriber list.
- Subscriber detail view.
- Export functionality.
- Notification destination settings.

**Frontend Locations:**

- Footer.
- Designated subscription sections.

---

## 23. Homepage Enhancements

### Implemented Features

#### Best Sellers

- Horizontal/grid support.

#### Recently Viewed

- Conditional rendering.
- Auto-hide when empty.
- Single-row carousel.
- Responsive behavior.

#### 4×4 Banner Grid

**Implemented:**

- 16-image grid.
- Caption support.
- Link support.
- Editable heading.
- Admin CRUD controls.
- Responsive support.

#### Featured Products Carousel

**Implemented:**

- Infinite carousel.
- Smooth loop.
- Responsive display.

#### Frontpage Responsive Fixes

**Implemented:**

- Frontpage responsiveness.
- Two-row category responsiveness.
- Single-row category responsiveness.
- Tablet/mobile optimization.

#### Special Offer Banner (Scope 5)

**Implemented:**

- Editable banner heading / section title.
- Admin-configured offers rendered dynamically on the storefront.
- Square-format preview in the admin listing. Edit-form thumbnail aspect is not uniformly square.

#### Homepage Blog Carousel (Scope 5)

**Implemented:**

- Homepage bundle supplies up to six published blog entries.
- Desktop presentation shows three entries at a time, with carousel navigation and responsive reduction on smaller viewports.

#### Homepage Slider Ordering (Scope 5)

**Implemented:**

- Configurable `displayOrder` on sliders.
- Administrative numeric ordering controls.
- Storefront and homepage bundle render sliders in the configured sequence.

---

## 24. Frontpage Media Section Refinement

**Implemented:**

- Backend/frontend alignment verification.
- Media rendering fixes.
- Frontend display stabilization.
- Existing architecture preservation.

**Important Constraint:**

No redesign or architectural overhaul was introduced.

---

## 25. Routing & Slug Synchronization

**Implemented:**

- Product slug synchronization.
- Blog slug synchronization.
- Frontend routing correction.
- Backend/frontend slug consistency.

**Important Architectural Rule:**

Frontend routing must always depend on backend-generated slug consistency.

---

## 26. Globalization & Performance

**Implemented:**

- Multi-language support.
- English support.
- Hindi support.
- Bengali support.
- next-i18next integration.
- Historical performance and testing work from earlier scopes.

**Scope 5 Point O is not represented by this section.** Website Performance & PageSpeed Optimization (Scope 5 Point O) is **deferred** and must not be treated as completed. Existing performance or scalability concerns elsewhere in project documentation are separate from Point O contractual completion.

---

## 27. Scope 5 Baseline (Post-Implementation)

Authoritative inputs: signed Scope 5 (contractual requirements), `SCOPE_5_IMPLEMENTATION_BASELINE.md`, `SCOPE_5_COMPLETION_REPORT.md` (repository audit, 15 August 2026), and the current repository.

**Status:** Scope 5 has been **completed with documented exceptions**. It is not gap-free.

| Classification | Items |
|---|---|
| Completed | a, b, f, g, i, j, k, l, n, p |
| Completed with documented caveat | e (header hover not browser-verified) |
| Partially completed | c, h |
| Not implemented as specified | d |
| Enhanced beyond signed scope | m (After-Sales vs basic Return & Refund) |
| Deferred | o (Performance & PageSpeed) |

Runtime browser QA was not part of the repository audit. Where live behavior was not proven, this document states that verification was not available.

Scope 6 (and later work) must **inherit** these modules and must not duplicate them. Open boundaries in §27.12 are **not** Scope 6 decisions.

### 27.1 Material capabilities (summary)

- Admin Settings: scripts and website colors (wired; live save/render unverified).
- PDP merchandising carousels and card actions.
- Category/taxonomy content (image, description, FAQ) with documented listing/extended-description gaps.
- Free shipping: existing global/min-order rules and coupons — **not** catalog-level flags.
- Homepage special-offer banner, blog carousel, slider ordering.
- Career Management System (public path environment-flagged).
- Seller Knowledge Base via CMS.
- Global Search across seven dimensions (contains-style matching).
- Category navigation active state.
- Role & Permission Management (admin/editor operational access).
- After-Sales Management (enhanced realization of signed Return & Refund).
- Order tracking consolidated to `/orders`.
- Product primary keyword advisory check; publish-time uniqueness remains authoritative.
- Point O performance/PageSpeed: **deferred**.

### 27.2 After-Sales Management (actual architecture)

Signed Scope 5 described a basic Return & Refund Management System. The implemented architecture is a broader **After-Sales Management System** with three operational roles: **Customer (shopper)**, **Seller**, and **Admin**.

Warranty Claims and Service Requests are **not** implemented workflows. They must not be treated as current capabilities.

**Implemented workflow (architectural level):**

```text
Seller Return Policy
        ↓
Product-Level Return Policy Override
        ↓
Return Eligibility
        ↓
Customer Need Help
        ↓
Evidence Submission
        ↓
Seller Review
        ↓
Refund / Replacement / Repair / Reject
        ↓
Customer Appeal (when applicable)
        ↓
Admin Review
        ↓
Final Resolution
        ↓
Refund → Shopper Wallet Credit
```

**Implemented capabilities:**

- Seller return policy: return allowed (yes/no), return window, return conditions.
- Product-level override, including configuring a product as no-return.
- Eligibility check (including return window) before Need Help.
- Customer Need Help from order history: reason, problem description, photo/video evidence.
- Duplicate and invalid request prevention.
- Seller review and seller-selected resolution.
- Customer appeal after seller reject; case moves to admin review.
- Admin review of case history; admin may uphold or override.
- Activity/status tracking for seller and admin; shopper sees status/resolution (full shopper status-history payload is not established as equivalent to admin/seller).
- Refund orchestration to Shopper Wallet credit, with wallet transaction history.
- After-Sales status/resolution visibility on Customer, Seller, and Admin order listings.

**Replacement and Repair:** implemented as resolution outcomes with **manual follow-up**. Automated replacement/repair fulfillment (outbound shipment, inventory allocation) is **not** established as implemented. That logistics direction remains an **open boundary**, not a decision in this document.

### 27.3 After-Sales financial baseline (implemented, not new policy)

Verified current behavior:

- When the final resolution is Refund and orchestration eligibility is met, the refund is credited to the **Shopper Wallet** (not established as a refund to the original payment instrument).
- Wallet credits are recorded in an immutable credit ledger with transaction history.
- Current After-Sales refund processing in the repository operates at **full-order** refund scope. This is a **current implemented baseline observation**, not a new locked business rule and not a newly decided line-item refund policy. Line-item refund rules are **not** defined here.

Mixed-cart eligibility and refund-scope treatment remain **open boundaries** for future financial work. This document does not convert those observations into Scope 6 decisions.

### 27.4 Shopper Wallet boundary (unambiguous)

**Implemented:**

After-Sales refund → Shopper Wallet credit → Wallet transaction history.

**Not implemented:**

**Shopper Wallet checkout redemption is NOT currently implemented.**

Do not describe Wallet as a checkout payment method. Do not imply that customers can spend wallet balance during checkout. Whether redemption is added later is an **open boundary**.

### 27.5 Role & Permission Management

**Implemented:**

- Admin/editor operational accounts with activation and deactivation.
- Access revocation via permission and session/token lifecycle controls used by the admin staff model.
- Permission-based access to administrative modules.
- Catalog model is **view** / **manage** (plus limited domain-specific actions such as import, fulfill, or approve where those exist). Distinct Edit vs Update permission keys are **not** the implemented catalog.
- Operational permissions for order-confirmation activities.
- Admin Login removed from storefront account navigation.
- Shopper Login and Seller Login remain on storefront navigation.
- Admin users access the administrative panel through the direct administrative URL.

### 27.6 Career Management

**Implemented (admin and APIs):**

- Career records with active/inactive (and related lifecycle) state.
- Start and end dates; display ordering.
- Public listing and detail when the new module is enabled.
- Apply Now / application workflow with resume/document upload.
- Administrative application visibility.
- Email notification capability for applications and related status updates.

**Environment gate:**

The public Career module requires both `USE_NEW_CAREER_MODULE` and `NEXT_PUBLIC_USE_NEW_CAREER_MODULE` to be `"true"`. Without both flags, storefront listing can remain on CMS/static career content.

**Production activation of these flags: Unable to verify from the current repository evidence.** Do not document the new public Career module as universally active.

### 27.7 Global Search

Storefront search supports:

- Product (name, with additional product text/SKU matching in the query builder)
- Category
- Subcategory
- Child Category
- Brand
- Seller
- Product Tags

Matching is **contains-style** (`$or` / substring-style), not a dedicated relevance-ranking score. Do not overstate search ranking sophistication. Mobile header search is wired; visual mobile QA was not run in the Scope 5 audit.

### 27.8 Taxonomy / category content

**Implemented at Category, Subcategory, and Child Category:**

- Optional image
- Description
- FAQ
- Optional display title
- Storefront category information and FAQ where content exists
- Category-related import/export compatibility for these fields

**Documented exceptions (Point C):**

- There is **no** separately verified **extended-description** field matching the signed Scope 5 requirement. Do not treat extended description as fully implemented.
- Admin category listing does not implement the complete specified column set (notably dedicated description and visibility columns). Mega-menu/commission columns remain category-level where that is how the hierarchy works.

### 27.9 Order tracking

**Canonical shopper order/tracking experience:** `/orders`.

The previous `/order-tracking` path redirects into that canonical order-management experience. Shopper list and detail surfaces present shipment/tracking summary.

A legacy shipping-page consumer (`ShopperShipping`) may still exist and is **not** claimed as fully eliminated. Canonical architecture for shoppers is `/orders`, not a separate mock tracking page.

### 27.10 Modules Scope 6 must not duplicate

After-Sales (`ReturnRequest` and related shopper/seller/admin routes), Shopper Wallet credit ledger, admin RBAC catalog, Career module (behind flags) plus CMS career/static pages, global search, taxonomy FAQ/description, slider `displayOrder`, and canonical `/orders` tracking.

### 27.11 Scope 5 Point O — Deferred

**Scope 5 Point O — Website Performance & PageSpeed Optimization — Deferred.**

This item is not a completed architecture capability of Scope 5. Do not conflate earlier-scope performance notes (§26) or other performance/scalability concerns with contractual completion of Point O.

### 27.12 Scope 5 exceptions and open boundaries

These are **implementation/status notes**, not technical-debt registry entries and not new architectural decisions.

**Point C** — Category enhancement is partially implemented; extended-description and specified listing columns have documented gaps.

**Point D** — Product/taxonomy-level free-shipping eligibility is **not implemented as specified**. Current architecture is global/min-order rules and coupon free shipping. Catalog-level direction remains open.

**Point E** — Header hover has code-level mitigation; runtime browser verification was not performed during the audit.

**Point H** — Career public module is environment-gated; production activation could not be verified from repository evidence.

**Point M** — Return & Refund evolved into After-Sales Management. Replacement and Repair are resolution outcomes / manual follow-up. Automated replacement logistics is not a verified Scope 5 capability. Wallet checkout redemption is not implemented. Mixed-cart and full-order refund observations are not converted into new financial rules here.

**Point O** — Performance/PageSpeed Optimization is deferred.

---

## 28. Locked Business Rules & Architectural Decisions

The following decisions are officially locked and should not be changed casually during future development.

### Locked Rules

1. Ratings persist even after product deletion.
2. Bank account confirmation validation is mandatory.
3. Subtotal must appear between product section and remove button.
4. Brand image is optional.
5. Slug synchronization must remain backend-driven.
6. Shipping follows hierarchical conditional resolution.
7. Frontend should avoid hardcoded business logic.
8. Environment-based configuration is mandatory.
9. Multi-language architecture is already integrated.
10. SEO field structure is standardized.
11. Product and blog draft system is standardized.
12. Variant system supports multi-dimensional combinations.
13. Product feature sections support enterprise RTE.
14. Product import/export supports advanced mappings.

---

## 29. Known Integration Areas Already Present

Future development must account for the existence of these integrations/modules:

- Shiprocket.
- PhonePe.
- GST engine.
- Variant engine.
- Subscription engine.
- SEO engine.
- CMS engine.
- Product import/export engine.
- Multi-language system.
- Shipping engine.
- Commission engine.
- Seller payout system.
- Rich text editor framework.
- After-Sales Management.
- Shopper Wallet (credit ledger only; not checkout tender).
- Admin RBAC (view/manage).
- Global search.
- Career Management (environment-flagged public module).

---

## 30. Development Guidelines for Future Tasks

### Before Implementing Any New Feature

Future developers or AI systems must:

1. Check whether the feature overlaps with existing systems.
2. Preserve current business rules.
3. Avoid duplicate logic.
4. Ensure responsive compatibility.
5. Ensure SEO compatibility.
6. Ensure multilingual compatibility.
7. Ensure seller/admin role compatibility.
8. Maintain import/export compatibility.
9. Maintain existing validation architecture.
10. Avoid hardcoded values.

---

## 31. Recommended Future Development Workflow

### Step 1 — Requirement Analysis

- Check this master document.
- Identify impacted modules.
- Verify dependencies.

### Step 2 — Technical Mapping

- Identify frontend impact.
- Identify backend impact.
- Identify database impact.
- Identify SEO impact.
- Identify multilingual impact.
- Identify responsive impact.

### Step 3 — Risk Analysis

Check whether the feature affects:

- Checkout.
- Shipping.
- Taxation.
- Seller payouts.
- Product engine.
- Variant engine.
- Routing.
- SEO.
- After-Sales / returns.
- Shopper Wallet.
- Admin permissions.

### Step 4 — Implementation

Implementation should remain:

- Modular.
- API-driven.
- Responsive.
- Validation-secured.
- SEO-safe.
- Multilingual-compatible.

### Step 5 — QA & Testing

Testing must include:

- Mobile.
- Tablet.
- Desktop.
- Admin workflows.
- Seller workflows.
- Shopper workflows.
- Import/export.
- Tax calculations.
- Shipping calculations.
- SEO rendering.

---

## 32. Scope Reference Sources

This documentation was consolidated from completed implementation scopes including:

- Initial platform stabilization scope.
- Major production-ready enhancement scope.
- Frontend/UI correction scope.
- SEO and product enhancement scope.
- Checkout and workflow stabilization scope.
- Shipping and GST implementation scope.
- Seller and payout system scope.
- **ANBAZAR Scope 5** (signed 23 June 2026) — contractual requirements for Scope 5.
- Scope 5 implementation baseline (`SCOPE_5_IMPLEMENTATION_BASELINE.md`) and Completion Report (`SCOPE_5_COMPLETION_REPORT.md`) — repository audit of what is actually implemented through Scope 5.

This Master Document incorporates the **current system state through Scope 5**, including documented exceptions. Earlier scopes remain part of the historical chain and are not removed.

**Primary reference documents:**

- Website Development Multi Vendor Ecommerce.
- Website Development Multi Vendor Ecommerce 2nd Scope.
- ANBAZAR Scope 3.
- ANBAZAR Scope 5 (signed PDF).
- `SCOPE_5_IMPLEMENTATION_BASELINE.md`.
- `SCOPE_5_COMPLETION_REPORT.md`.

---

## 33. Final Notes

The platform has evolved significantly beyond MVP stage and now contains multiple interconnected systems.

Future development must prioritize:

- Stability.
- Scalability.
- Business-rule consistency.
- Backward compatibility.
- SEO integrity.
- Mobile responsiveness.
- Validation integrity.
- Role-based workflows.
- Integration safety.

This document should be continuously updated whenever:

- A new module is added.
- A workflow changes.
- A business rule changes.
- A major integration is introduced.
- A system-level architectural decision is finalized.
