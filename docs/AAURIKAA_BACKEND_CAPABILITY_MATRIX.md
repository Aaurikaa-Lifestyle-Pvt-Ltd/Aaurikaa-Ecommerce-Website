# AAURIKAA Backend Capability & Gap Matrix

**Document type:** Phase 1 audit only (read-only).  
**Date:** 2026-08-19  
**Functional source of truth:** `docs/SRS_Aaurikaa_Ecommerce_Website.md`  
**Implementation source of truth:** `backend/` (ANBAZAR-derived Express + MongoDB baseline)  
**Assembly context:** `docs/AAURIKAA_BASELINE.md`  
**Technical debt source:** `docs/TECHNICAL_DEBT_REGISTRY.md`

No application code, schemas, routes, environment files, or dependencies were modified during this audit.

---

## 1. Executive Summary

The current backend is a **mature multi-vendor marketplace commerce engine**, not a missing product platform. Catalogue, cart, checkout, GST, zone shipping, PhonePe initiate/status, Shiprocket fulfilment, invoices, returns intake, CMS, search, and admin RBAC are implemented in code.

AAURIKAA cannot go live by “reusing the backend as a black box.” Three structural facts dominate:

1. **The storefront and this admin app do not call the backend.** Both Next.js apps are local mock demos. That is an integration gap, not a backend capability gap.
2. **The backend assumes multiple sellers.** Product ownership, GST origin, Shiprocket grouping, return operations, commission, payout, and public storefronts are seller-scoped. A single-vendor AAURIKAA model can keep most of this internally if one Seller record is treated as the store identity — but marketplace surfaces must not ship.
3. **Inventory quantity is stored and checked, then never moved.** Checkout validates stock and never decrements it (TD-016). Cancellation, returns, and replacement do not restock. This is the highest-risk commerce defect for a jewellery catalogue.

Refund **destination** is explicitly unfinished in the SRS. The code already credits a shopper wallet on after-sales refund resolution and has **no PhonePe refund API**. That destination must not be decided by engineering.

### Counts (33 SRS sections)

| Classification | Count | Meaning |
|---|---|---|
| 🟢 REUSE AS-IS | **6** | Usable for AAURIKAA without meaningful backend change |
| 🟡 CONFIGURE | **4** | Exists; needs env, content, or single-store settings |
| 🟠 ADAPT | **17** | Close; controlled code changes required |
| 🔴 BUILD | **5** | Genuinely missing first-class capability |
| ⚪ HOLD / BUSINESS DECISION | **1** | Must not be implemented until policy is confirmed |
| Unknown | **0** | No SRS section left unclassified; residual uncertainty is listed in §10 |

**SRS sections audited:** 33 (every H2 in the approved SRS).

**Additional mature modules inspected (not separate SRS H2s):** Brand, SKU rules, import/export, blog, tags, compare, seller portal, commission/payout, wallet credit.

---

## 2. Capability Matrix

Legend for **Compatibility:** 🟢 REUSE AS-IS · 🟡 CONFIGURE · 🟠 ADAPT · 🔴 BUILD · ⚪ HOLD

**Current capability** in the Implementation column uses: Fully / Partially / Not supported.

| # | SRS Requirement | Existing Implementation | Evidence / Files | Compatibility | Action | Dependencies / Risk |
|---|---|---|---|---|---|---|
| 1 | **Homepage & Visual Merchandising.** Announcement, hero, new arrivals, featured/bestsellers, category discovery, collection stories, shop by occasion, campaign banners, brand story, shop the look, UGC, trust messaging, engagement, footer. Admin-manageable where applicable. | **Partially supported.** Sliders, banner offers, 4×4 grid, homepage category rows, homepage bundle, site footer/logo, newsletter, computed featured + bestsellers exist. Collection stories, occasions, shop the look, and UGC have **no backend entities**. New arrivals/bestsellers are computed, not curated pickers. `buildBestSellerFilter()` is unused. | `backend/routes/homepageBundleRoutes.js`; `models/Slider.js`; `routes/sliderRoutes.js`; `models/bannerSettingsModel.js`; `models/HomepageGrid4x4.js`; `models/HomepageCategoryConfig.js`; `models/SiteSettings.js`; `models/offer.js`; `routes/newsletterRoutes.js` | 🟠 | Adapt homepage composition to AAURIKAA sections. Reuse slider/banner/grid/bundle. Build missing merchandising entities (see #4, #6, #7). | Marketplace copy and seller-filtered bestsellers. Frontend homepage is mock (`frontend/src/config/homepage.ts`, `frontend/src/data/*`). |
| 2 | **Product Catalogue & Discovery.** Listing, category/collection/occasion browse, search, filters, sorting, availability, cards, quick add, related products, new arrivals, bestsellers, curated showcases. | **Partially supported.** Public product listing/search/taxonomy browse, related products, labels `new/sale/deal/featured`, computed new/bestseller queries. **No** collection or occasion landing APIs. Category-by-slug listing ignores price/sort/pagination. In-stock filter uses parent `stock` only. Quick add is a storefront UX concern; add-to-cart API exists. | `routes/publicProductRoutes.js`; `services/search/globalSearchService.js`; `routes/taxonomyRoutes.js`; `utils/productLabels.js`; `GET /api/products/related` | 🟠 | Reuse product engine and listing filters. Add collection/occasion scoping. Do not rebuild catalogue. | Seller ownership on every product. `publicProductController.js` is unused (live logic is inline in routes). |
| 3 | **Product Detail & Product Media.** Name, description, pricing, discounts, SKU, gallery, video, variants, variant price/availability, qty, features, add to bag, wishlist, related, availability, SEO. Jewellery attributes must not be mandatory. | **Fully supported** on the product engine. Schema has prices, SKU, `mainImage`/`galleryImages`/`video` + Media IDs, embedded variants + `variantPricing`/`variantStock`/`variantSku`/`variantMedia`, features, SEO fields, related endpoint, wishlist, cart add. Key-feature catalogue is optional attributes. | `models/Product.js`; `models/Media.js`; `utils/variantUtils.js`; `routes/mediaRoutes.js`; `models/KeyFeatureCatalogue.js`; `routes/shopperRoutes.js` (cart/wishlist) | 🟢 | Reuse product engine. No new PDP architecture. | Variant maps live on Product (not a Variant-SKU collection). Storefront types (`price.amount`, `variantId`) do not match API (`regularPrice`/`salePrice`, `variantKey`). |
| 4 | **Categories, Collections & Occasions.** Hierarchy, curated collections, occasion shopping, product association, visibility, ordering, SEO. Typical occasions: Wedding, Festive, Party, Everyday. | **Partially supported.** 3-level taxonomy (Category → Subcategory → ChildCategory) with slugs, images, FAQ, mega menu. **No `Collection` or `Occasion` model.** Occasion/collection exist only as Key Feature codes (`apparel.occasion`, `footwear.occasion`, `design.collection`) or merchandising labels. Taxonomy SEO is generated (`"Name / Parent - AnBazar"`), not CMS-authored meta fields. | `models/Category.js`; `Subcategory.js`; `ChildCategory.js`; `routes/categoryRoutes.js`; `taxonomyRoutes.js`; `data/keyFeatureCatalogueBaseline.json`; `utils/productLabels.js` | 🟠 | Reuse category hierarchy. **Build** collection and occasion as first-class merchandising (or confirm mapping onto taxonomy — that would still be an adaptation, not reuse of a missing entity). | Using Key Features as occasions would leak apparel/footwear taxonomy into jewellery and would not give landing CMS. |
| 5 | **Search.** Product search by name/catalogue info, results page, filter, sort, availability, PDP navigation. | **Fully supported** for Mongo regex search: `q` on name/shortDesc/longDesc/SKU plus resolved entities/tags; suggestions for products/categories/brands/sellers/tags; listing filters (price, rating, inStock, brand, tag, merchandising label); sorts including newest/price/rating/name/sales. | `routes/globalSearchRoutes.js`; `services/search/globalSearchService.js`; `GET /api/products?q=` | 🟢 | Reuse search. No Elasticsearch required for SRS. | Does not search Key Feature/occasion values. Public seller hits in suggestions should be hidden. TD-002 adjacent: listing is public (expected). |
| 6 | **Shop the Look.** Curated looks, imagery (incl. mobile), title/content, associated products, CTA, ordering, visibility. | **Not supported.** No look/lookbook model, routes, or product-to-look relation. Frontend mock only (`frontend/src/data/looks.ts`). | Backend grep: no `shopTheLook` / lookbook domain hits. | 🔴 | Build a lightweight Look CMS (media + products + order + enabled). Do not overload Product or Collection for this. | Media library can be reused for imagery. |
| 7 | **Styled by You / UGC.** Image/video, creator attribution, caption, product association, optional external link, ordering, enable/disable, delete. Curated CMS only — no Instagram feed. | **Not supported.** No UGC model/routes. `Comment.js` is blog comments. Frontend mock only (`frontend/src/data/ugc.ts`). | Backend grep: no ugc / styled-by-you product domain. | 🔴 | Build curated UGC CMS as specified. Do not add social-feed integration. | Media upload stack exists (`mediaController.js`) but has no shopper/UGC category for this use. |
| 8 | **Wishlist.** Add/remove, view saved products, availability, move available items to bag. | **Fully supported** for logged-in shoppers: wishlist of Product IDs; add/remove/get. Availability follows product/stock when populated. Move-to-bag is the existing cart add API (no dedicated “move” endpoint). Guest wishlist is not in the backend. | `models/Shopper.js` (`wishlist[]`); `routes/shopperRoutes.js`; `shopperController.js` | 🟢 | Reuse wishlist + cart add. Guest wishlist is a storefront concern unless SRS is extended. | Auth required. Current storefront heart toggle is `useState` only. |
| 9 | **Shopping Cart & Mini Cart.** Add, quick add, mini cart, cart page, qty, remove, variant-aware lines, subtotal, coupon, shipping, summary, continue, checkout. | **Fully supported** for logged-in cart API. Variant-aware lines; stock on add/qty update; pricing quote API for coupon/shipping/GST. Mini cart is UI. Cart is **not** cleared on order create. Guest cart is not persisted server-side. | `models/Shopper.js` (`cart[]`); `services/cartAddService.js`; `routes/shopperRoutes.js`; `POST /api/pricing/calculate` | 🟢 | Reuse shopper cart + pricing quote. Mini cart is frontend. | TD-002: pricing POSTs are unauthenticated. Mixed-seller carts allowed. Frontend cart is `localStorage` (`imagineairy.cart.v1`) with a different line shape. |
| 10 | **Checkout & Payments.** Customer info, shipping/billing, delivery option, shipping charge, coupon, GST, summary, COD, PhonePe, payment status, placement, confirmation. No storage of sensitive card credentials. | **Partially supported.** Logged-in `POST /api/orders` recomputes coupon + zone shipping + GST, persists Order, sequential invoice number. COD and PhonePe V2 initiate + status poll + 10-min cron. **No** guest checkout. **No** PhonePe webhook. **No** customer delivery-option picker (engine chooses zone slab / free overlay). Default create method still includes `upi_manual`. Stripe/Razorpay are enum stubs. | `routes/orderRoutes.js`; `services/orderProcessingService.js`; `services/gstEngineService.js`; `services/shippingEngineService.js`; `routes/paymentRoutes.js`; `services/phonePeService.js`; `jobs/paymentVerificationJob.js` | 🟠 | Reuse checkout write path and PhonePe/COD. Adapt payment method surface to SRS (COD + PhonePe). Configure PhonePe env. Do not store cards (already true). | Coupon usage recorded on **unpaid** create. Stock not decremented. Frontend checkout is a disconnected demo (`lib/checkout.ts`). |
| 11 | **Customer Account & Email OTP Authentication.** Register, login, email OTP, password recovery, logout, profile, addresses, order history/details, invoice, return/replacement/refund status, wishlist. SMS/WhatsApp OTP out of scope. | **Partially supported.** Register + email registration OTP; **password login**; email OTP for password reset; profile; addresses; order list/detail DTOs with after-sales + invoice URL + tracking; wishlist. Logout is client token discard (stateless JWT). `verifyOTP` still uses in-memory `otpStore` while send uses `otpService` (TD-003). Shopper has **no** account-status flag. | `routes/shopperRoutes.js`; `utils/otpService.js`; `models/OTP.js`; `models/Shopper.js`; `routes/addressRoutes.js`; `controllers/shopperOrderController.js`; `routes/shopperReturnRoutes.js` | 🟠 | Reuse account APIs. Adapt auth to SRS “email OTP for authentication” **or** confirm password login is acceptable. Consolidate OTP store. | Dual OTP (TD-003). JWT in localStorage is a future frontend issue (TD-005). |
| 12 | **Order Management & Order Tracking.** Creation, unique number, summary, items, pricing/discounts, payment, shipping, status, cancel where applicable, history, invoice, shipment, courier, AWB, timeline, delivery. | **Fully supported** for shopper read path and admin order list/status. Unique invoice number; list/detail DTOs; cancel with reason; shipment summary + Shiprocket tracking URL; coarse order timeline. No dedicated public `/track` URL — tracking is on order detail. Cancel lacks full fulfilment guards (TD-015). | `models/Order.js`; `routes/orderRoutes.js`; `routes/shopperOrderRoutes.js`; `services/shopperOrderDetailService.js`; `routes/adminOrderRoutes.js`; `utils/orderFulfillmentGuards.js` | 🟢 | Reuse order engine and shopper DTOs. Collapse duplicate mounts later (TD-007). | Shared Order status across sellers. Commission not created when delivered via Shiprocket poll (TD-012) — marketplace finance, still a fulfilment-state risk. |
| 13 | **Reviews & Ratings.** Ratings, reviews, submission, management, moderation, rating summary, review media where applicable. | **Partially supported.** Product reviews, verified-purchase query, pending/approved/rejected, admin moderate, `avgRating`/`reviewCount`. **No review photos/video.** Default status is `approved`. Seller/admin can also write reviews (marketplace). | `models/Review.js`; `routes/reviewRoutes.js`; `services/reviewEligibilityService.js`; `services/reviewModerationService.js`; `services/ratingAggregationService.js` | 🟠 | Reuse review engine. Add media only if SRS “where applicable” is confirmed as required. Hide seller-authored reviews on storefront. | `Review.seller` required. One review per role per product. |
| 14 | **Shipping & Shiprocket.** Charge calculation, shipment create, courier/AWB, tracking, status updates, forward shipment, customer tracking, reverse pickup, admin shipment info. | **Partially supported.** Checkout uses **zone + weight-slab + free-shipping rules**, not Shiprocket rates (`fetchRates` unused on live path). After paid/COD, `maybeSyncShiprocket` groups lines **per seller**, creates Shiprocket orders, AWB, labels, 15-min tracking poll, reverse pickup via `createReturnOrder`. Customer tracking on order DTO. | `services/shippingEngineService.js`; `services/orderFulfillmentService.js`; `services/shipRocketService.js`; `services/pickupLocationService.js`; `routes/admin/orderShiprocketRoutes.js`; `services/reverseLogisticsService.js`; `routes/shipping.js` | 🟠 | Reuse shipping engine + Shiprocket fulfilment. Configure credentials and **one default pickup**. Adapt grouping so AAURIKAA is one shipment identity. | Missing pickup skips that seller’s shipment. Cron duplication under multi-instance (TD-008). |
| 15 | **Inventory Management.** Product- and variant-level stock, available/low/OOS, manual adjust + reason, movement history, product-admin visibility, monitoring, reporting; updates from orders, cancellations, approved returns, replacement orders. | **Partially supported — stock fields and checks exist; lifecycle does not.** `Product.stock` + `Product.variantStock` map. `Variant` model has **no** quantity. Cart/checkout validate availability. **No production decrement.** No restore on cancel/return. Manual seller PUT sets parent `stock` only; `reason` is logged, not stored. “Movements” are sales aggregates, not a ledger. No concurrency control. Low-stock APIs exist on **seller** inventory routes; admin dashboard counts `stock <= 10`. | `models/Product.js`; `utils/variantUtils.js`; `services/orderProcessingService.js`; `routes/orderRoutes.js` (`salesCount` only); `controllers/sellerInventoryController.js`; TD-016 | 🟠 | Adapt: implement decrement/restore/ledger on the **existing** stock fields. Do not invent a second inventory product. Classify lifecycle pieces as BUILD (see §6). | Highest oversell risk. Back-in-stock emails only fire after **manual** restock today. |
| 16 | **Returns Management.** Eligibility, request, reason, photo/video evidence, review, approve/reject, reverse pickup, tracking, receipt, inspection, status, customer visibility, admin review, appeal. | **Fully supported** as after-sales Need Help (order-level, not line-item). Eligibility (delivered + window + policy); evidence to R2; seller review; reverse Shiprocket; receipt confirm; appeal; admin override. Inspection is a **status gate only** (no QC record). New cases are `caseFlow: "after_sales"` (seller-owned). Legacy admin refund path still exists (TD-018). | `models/ReturnRequest.js`; `routes/shopperReturnRoutes.js`; `services/returnEligibilityService.js`; `services/sellerReturnService.js`; `services/reverseLogisticsService.js`; `routes/adminReturnRoutes.js`; `utils/returnPolicyResolver.js` | 🟠 | Reuse return spine. Adapt ownership from seller queue to AAURIKAA admin ops. Keep evidence + reverse logistics. | Full-order only; one practical case per order. Return policy lives on **Seller**, not SiteSettings. |
| 17 | **Replacement Management.** Request, eligibility, evidence, review, inspection, decision, replacement order, inventory, shipment, tracking, customer visibility. Integrated with inventory and shipping. | **Not supported as fulfilment.** `resolution: "replacement"` is **record-only**. Sets `manualFollowUpRequired`. No replacement order, stock move, outbound shipment, or replacement tracking. Customer email says the team will arrange manually. | `constants/returnRequestConstants.js` (`MANUAL_FOLLOW_UP_RESOLUTIONS`); `models/ReturnRequest.js`; `services/sellerReturnService.js`; `services/returnNotificationService.js` | 🔴 | Adapt return case spine; **build** replacement order + inventory + Shiprocket outbound. Until then, gap is manual follow-up. | Blocked on inventory decrement design and refund/replacement policy overlap. |
| 18 | **Refund Management.** Eligibility, calculation, approval, processing, status, history, customer visibility, admin management. Method, destination, conditions, timelines = client Refund Policy. **Confirm policy before implementing refund workflow.** | **Partially supported technically; policy HOLD.** After-sales `resolution: "refund"` credits **shopper wallet** (full-order, idempotent). Legacy admin “mark refund complete” does **not** call a PSP. **No PhonePe refund method exists.** Wallet cannot be spent at checkout. CMS copy still talks about original payment method — that is content, not code. | `services/returnRefundOrchestrationService.js`; `services/shopperWalletService.js`; `models/ShopperWalletLedger.js`; `services/phonePeService.js` (no refund); SRS Refund section | ⚪ | **HOLD destination.** Do not choose wallet vs PhonePe vs original method in this phase. Existing wallet credit can be reused **if** policy selects store credit. | Financial ledger also reverses **seller commissions** — marketplace assumption. |
| 19 | **GST & Tax.** GST calc, CGST/SGST, IGST, breakdown on order/invoice, business GST configuration. | **Fully supported** on persist: `gstEngineService` (inclusive/exclusive, shipping taxed, CGST+SGST or IGST, UGST for listed UTs). Stored on Order + invoice GST table. Business GSTIN on `SiteSettings.footer.gstin`. **Origin state comes from `product.seller.address.state`.** Missing origin defaults **intra-state**. | `services/gstEngineService.js`; `models/Order.js` tax snapshots; `services/invoicePdfService.js`; `models/SiteSettings.js`; `routes/admin/taxRoutes.js` | 🟠 | Reuse GST engine. Adapt origin to AAURIKAA store state (not per-seller). Configure GSTIN and tax rates on catalogue. | Wrong origin ⇒ wrong CGST vs IGST. Legacy `taxCalculator.js` is unused on live path (tests/helpers). |
| 20 | **Invoice & Order Documents.** PDF invoice with order, customer, items, pricing, GST, shipping, totals, business info; customer and admin access. | **Partially supported.** Professional PDF via `invoicePdfService` on `GET /api/orders/:id/invoice` (**shopper auth**). Sequential `INV-YYYYMMDD-NNNN`. Admin order routes have **no** invoice download. Default seller block is still “Multi-Vendor Ecommerce” / `support@multivendor.com`. Dead simple `invoiceController.downloadInvoice` is not the live path. | `services/invoicePdfService.js`; `routes/orderRoutes.js`; `controllers/invoiceController.js` (stub, unused on live mount) | 🟠 | Reuse PDF service. Configure legal entity block. Add admin download if required. | Branding/GSTIN must be AAURIKAA before production invoices. |
| 21 | **Coupons & Promotions.** Create/edit, % / fixed / free shipping, min order, validity, expiry, usage limits, validation, usage tracking, enable/disable. | **Partially supported.** Model has `usageLimit` / `perUserLimit` / history. Checkout `validateCoupon` enforces limits when `buyer` is passed. Admin CRUD **does not accept** usage limit fields. Quote `POST /api/pricing/validate-coupon` skips `userId`. Quote `calculateDiscounts` does not check usage limits. Usage recorded on order **create**, including unpaid PhonePe. Offers (`offer.js`) are announcement text, not cart discounts. | `models/coupon.js`; `controllers/couponController.js`; `utils/pricingEngine.js`; `services/orderProcessingService.js` | 🟠 | Reuse coupon engine. Expose limits in admin API; apply usage on payment success, not create. | TD-002 coupon probing on public pricing. |
| 22 | **Customer Management (Admin).** Listing, search, profile, contacts, addresses, order/invoice/return/replacement/refund history, account status. | **Partially supported.** Admin shopper CRUD list/create/update/delete. **No** search endpoint, **no** embedded order/return/refund history on shopper resource, **no** account status field. Orders and returns are separate admin APIs. Addresses via `/api/addresses/admin`. | `routes/admin/shopperRoutes.js`; `shopperController.getAllShoppers`; `routes/adminOrderRoutes.js`; `routes/adminReturnRoutes.js`; `models/Shopper.js` | 🟠 | Reuse shopper + order + return APIs; compose an admin customer 360 view. Add status only if required. | Do not build a parallel customer database. |
| 23 | **Admin Dashboard.** Order/sales summary, pending orders, shipments, returns/replacements, customers, low stock, recent activity, operational KPIs. Not enterprise BI. | **Partially supported.** Aggregates products, sellers, shoppers, orders, commissions; low-stock count on parent `stock`; activity/analytics endpoints; RBAC-scoped sections. Widgets assume marketplace (sellers, commission). Replacement is not a first-class KPI (returns only). | `routes/dashboardRoutes.js`; `controllers/dashboardController.js`; `utils/dashboardStatsAccess.js` | 🟠 | Reuse dashboard skeleton. Hide seller/commission; keep orders/customers/low-stock/revenue. | Low-stock ignores `variantStock`. |
| 24 | **Product, Category & Catalogue Administration.** CRUD, status, SKU, pricing, categories, variants, stock, media, descriptions, SEO, hierarchy, association. | **Fully supported** (admin + seller product modules). SKU rules, variant SKUs, bulk import/export, media DAM, taxonomy admin, trash/autosave. Admin **assigns a seller** on create. Product `approvalStatus` is a marketplace gate. | `routes/admin/productRoutes.js`; `controllers/adminProductController.js`; `utils/skuGenerator.js`; `utils/productImportExport/`; `routes/admin/skuRuleRoutes.js` | 🟡 | Configure single-business owner / auto-approve. Reuse catalogue admin APIs. Hide seller product portal. | Import uniqueness still seller-aware. |
| 25 | **Homepage & Promotional Content Management.** Promotional content, announcements, campaign banners, seasonal/editorial campaigns, imagery, links, order, enable/disable, merchandising. | **Partially supported.** Sliders, banner settings, 4×4 grid, homepage categories, offers (announcement text). No campaign entity spanning AAURIKAA homepage modules (collection stories, looks, UGC). Admin app CMS page is a mock hero form, not these APIs. | `sliderRoutes.js`; `bannerSettingsRoutes.js`; `admin/homepageGrid4x4Routes.js`; `admin/homepageCategoryRoutes.js`; `offerRoutes.js` | 🟠 | Reuse existing homepage CMS APIs; extend for AAURIKAA-only modules. | Permission domain `homepage` already exists. |
| 26 | **Collections, Occasions & Merchandising Management.** Collection/occasion CRUD, product association, visibility, ordering, content, shop the look, associated products. | **Not supported** as admin resources. No collection/occasion/look admin routes. | (none) | 🔴 | Build with #4 and #6. | Do not misuse Category for editorial collections without an explicit mapping decision. |
| 27 | **Styled by You / UGC Management.** Add, upload, caption, creator, product association, external link, order, visibility, delete. | **Not supported.** | (none) | 🔴 | Build with #7. | — |
| 28 | **CMS, FAQ & SEO Management.** Website content, FAQ, about, care, shipping/return/refund/terms/privacy, SEO, product/category SEO, meta, friendly URLs. | **Fully supported** as a CMS platform, with AnBazar content. Dual CMS: `CmsPage` + allowlisted `StaticPageContent` (FAQ, policies, about, contact, help-center). Product SEO fields; site SEO; blog SEO richest. Category SEO generated, not stored. Seller FAQ / become-seller pages are marketplace. | `models/CmsPage.js`; `models/StaticPageContent.js`; `config/staticPageRegistry.js`; `config/staticPageManifests.js`; `utils/seoMetadata.js`; Product SEO fields | 🟡 | Reuse CMS/static/SEO. Replace AnBazar copy; hide seller pages; author AAURIKAA policy pages **after** refund/return policy confirmation. | Policy pages currently describe original-method refunds and manual replacement — conflicts with code. |
| 29 | **Customer Enquiries & Support.** Enquiry submission, contact capture, management, status, admin visibility, care/FAQ. | **Fully supported.** Public create (optional shopper); statuses `submitted/in_review/resolved/closed`; admin routes; FAQ static pages. | `models/CustomerEnquiry.js`; `routes/customerEnquiryRoutes.js`; `routes/admin/customerEnquiryRoutes.js`; `routes/shopperEnquiryRoutes.js` | 🟢 | Reuse. Configure notification email on SiteSettings. | Marketplace enquiry categories include `seller`. |
| 30 | **Admin Users & RBAC.** User/role/permission management, module and action access, activation, secure admin auth, sensitive ops control. | **Fully supported.** Domain:action catalog (catalog, orders, returns, finance, cms, …); Super Admin staff CRUD; JWT + `requirePermission`; production enforcement flag. Includes **sellers** and **finance/payouts** domains. | `config/adminPermissionCatalog.js`; `middleware/requirePermission.js`; `routes/adminRoutes.js`; `utils/adminAuthChain.js` | 🟡 | Reuse RBAC. Hide or re-label sellers/finance. Keep catalog/orders/shoppers/cms. | `PERMISSION_ENFORCEMENT` must be on in production. |
| 31 | **Store & Business Settings.** Store info, address, contact, GST, shipping, free-shipping threshold, payment, return/replacement/refund policy, Shiprocket, other ops. | **Partially supported.** SiteSettings: branding, contact, footer GSTIN, SEO, maintenance, homepage media. Shipping/free-shipping are **rule collections**, not a single threshold field on SiteSettings. Return policy is **per Seller**. No SiteSettings payment/Shiprocket/refund/replacement policy objects (those are env + CMS + Seller). | `models/SiteSettings.js`; `routes/settingsRoutes.js`; `models/FreeShippingRule.js`; `models/Seller.js` (`returnWindowDays`); Shiprocket env in `shipRocketService.js` | 🟠 | Configure store identity on SiteSettings + one Seller policy record + env. Adapt if AAURIKAA needs first-class policy settings on SiteSettings. | Comment on SiteSettings: platform global return policy is **retired**. |
| 32 | **Back-in-Stock Notifications.** Product/variant subscription, monitoring, restock detection, trigger, admin request management. | **Fully supported** as a notification subsystem: subscribe when qty is 0; Product post-hooks email when qty > 0; admin list. **Practically incomplete** because sales never decrement stock, so restock only happens after manual edits. | `models/StockNotificationRequest.js`; `routes/stockNotificationRoutes.js`; `routes/admin/stockNotificationRoutes.js`; `models/Product.js` post-save hooks | 🟠 | Reuse notify pipeline; it becomes meaningful only after inventory decrement. | `findOneAndUpdate` must return the document for hooks. |
| 33 | **Static, Legal & Customer Care Pages.** About, contact, shipping, returns, refund policy, terms, privacy, FAQ/care, other approved content. | **Fully supported** via static page registry. Content is AnBazar/marketplace including become-seller, seller-faq, seller-terms. | `config/staticPageRegistry.js`; `routes/staticPageRoutes.js`; `routes/admin/staticPageRoutes.js` | 🟡 | Reuse page engine. Configure AAURIKAA pages; unpublish seller marketplace pages. | Do not treat CMS refund copy as implemented refund policy. |

---

## 3. Single-Vendor Dependency Map

The backend is a marketplace. Orders are **not** split into child Order documents. Multi-vendor appears as ownership, grouping, and finance.

| Area | Where it lives | Classification for AAURIKAA |
|---|---|---|
| Product commercial owner | `Product.seller`, `Product.sellerShop`, `ownerUserId`; `productListingService.buildSellerOwnershipFilter` | **Needs adaptation** — pin all products to one store Seller, or make seller optional later |
| Product approval gate | `Product.approvalStatus` | **Needs configuration/bypass** — auto-approve first-party catalogue |
| Seller auth / KYC / register | `routes/sellerAuthRoutes.js`; `models/Seller.js`; `middleware/verifySeller.js` | **Can remain internally but should not surface**; disable public register |
| Seller product/order/inventory/dashboard/returns | `/api/seller/products`, `/api/orders/seller`, `/api/seller/inventory`, `/api/seller/dashboard`, `/api/seller/returns` | **Should not surface**; admin equivalents exist |
| Public storefront | `/api/sellers/storefront/:shopUrl`; `utils/sellerStorefront.js`; search `sellers[]` | **Can eventually be removed**; hide now |
| Order document split | None — one `Order` per checkout | **Not required** |
| Shiprocket split | `orderFulfillmentService.groupItemsBySeller` → `Order.shiprocketShipments[]` | **Needs adaptation** if multiple seller IDs exist; **works as-is** with one seller |
| Pickup | `SellerPickupLocation`; `pickupLocationService.resolvePickupForSeller` | **Required** as store warehouse; hide “assign to seller” |
| GST origin | `product.seller.address.state` vs destination | **Needs adaptation** — use AAURIKAA place of supply |
| Return policy | Seller defaults + product override (`returnPolicyResolver.js`) | **Needs configuration** on the single Seller; optionally later move to SiteSettings |
| After-sales operator | Seller review/receipt/resolution APIs | **Needs adaptation** — AAURIKAA ops should use admin (override exists; seller path is the live operator path) |
| Commission | `utils/calculateCommission.js` (default **5%**); created on seller `delivered` | **Needs configuration/bypass** (0%) or stop writing commissions |
| Ledger / payout | `SellerLedger`, `Payout`, `routes/commissionRoutes.js`, `/api/admin/payouts` | **Can remain internally but should not surface**; **can eventually be removed** |
| Delivered commission gap | TD-012: Shiprocket poll sets `delivered` without commission write | **Unknown importance** if commission is bypassed; still a dual-writer status risk |
| Admin RBAC `sellers` / `finance` | `config/adminPermissionCatalog.js` | **Can remain internally**; hide in AAURIKAA admin UI |
| Seller subscription/plans | Not implemented | **Not required** |
| Invoice/SEO “Multi-Vendor” copy | `invoicePdfService.js` `DEFAULT_SELLER`; static manifests | **Needs configuration** |
| `SellerShop.js` | Leftover model | **Can eventually be removed** |

**Unknown (business choice, not a code gap):** whether AAURIKAA’s store identity is (A) one seeded `Seller` document reused by admin catalog, or (B) Admin-owned products with `seller` made optional. (A) is the lower-risk reuse path.

---

## 4. Critical Path Traces (read-only)

### 4.1 Checkout

```
Shopper.cart (Mongo, verifyShopper)
  → POST /api/pricing/calculate          (optional quote; no auth)
  → POST /api/orders                     (verifyShopper)
       createShopperOrderHandler
         → variant validation
         → createOrderWithBulkDiscounts
              stock CHECK (no decrement)
              coupon validateCoupon(code, subtotal, buyer)
              shippingEngineService.calculateShipping
              gstEngineService.calculateGST
         → Order.save
         → Product.salesCount += qty     (not stock)
         → recordCouponUsage             (including unpaid)
         → invoiceNumber INV-YYYYMMDD-NNNN
         → COD → maybeSyncShiprocket
  → POST /api/payment/initiate           (PhonePe V2)
  → POST /api/payment/verify or 10-min cron
  → paid → maybeSyncShiprocket
```

**Files:** `backend/routes/orderRoutes.js`; `backend/services/orderProcessingService.js`; `backend/utils/pricingEngine.js`; `backend/services/shippingEngineService.js`; `backend/services/gstEngineService.js`; `backend/controllers/paymentController.js`; `backend/services/phonePeService.js`; `backend/services/orderFulfillmentService.js`; `backend/models/Order.js`; `backend/models/Shopper.js`.

### 4.2 Order fulfilment

```
Order paid | COD processing
  → maybeSyncShiprocket (skip if shiprocketShipments already exist)
  → groupItemsBySeller
  → resolvePickupForSeller
  → shipRocketService.createShipment (per seller)
  → admin generate-awb / label
  → pollTrackingUpdates every 15 min
  → map carrier status onto Order (highest of multi-shipments)
  → shopper detail DTO: trackingUrl = shiprocket.co/tracking/{awb}
```

Seller marking `delivered` also writes Commission + SellerLedger. Polling-delivered does **not** (TD-012).

### 4.3 After-sales

```
GET  /api/shopper/orders/:id/return-eligibility
POST /api/shopper/orders/:id/return-evidence
POST /api/shopper/orders/:id/return-request     → caseFlow after_sales, pending_review
  → PATCH /api/seller/returns/:id/review        → accept (returnRequired?) | reject
       if physical: scheduleReturnPickup (Shiprocket reverse)
       awaiting_pickup → poll → in_transit
       PATCH confirm-receipt → awaiting_inspection
  → PATCH /api/seller/returns/:id/resolution
       refund        → wallet credit + commission reversal (full order)
       replacement   → resolved + manualFollowUpRequired (STOP)
       repair        → same manual follow-up
  → shopper appeal → admin override
```

Admin legacy `return-review` / `refund-review` / `refund-complete` are **blocked** for after_sales cases. Admin `PATCH .../override` is the governance path.

---

## 5. Inventory Audit (high priority)

| SRS inventory concern | Finding |
|---|---|
| Where stock is stored | `Product.stock` (parent) and `Product.variantStock` `{ variantKey: Number }`. `models/Variant.js` is an option dictionary — **no stock**. |
| Product-level vs variant-level | Both fields exist on Product. Live lookup: `getVariantStock()` in `utils/variantUtils.js`. |
| Validation | Add-to-cart, qty update, checkout `validateAndProcessOrder`. |
| Decrement | **None in production.** Only `$inc` at checkout is `salesCount`. The only `$inc: { stock: -n }` is a Jest mock in `tests/integration/seller-order-management.test.js`. |
| Restoration on cancel | **None.** `cancelShopperOrder` sets status only. Payment-failed cancel also does not restore (nothing was decremented). |
| Return restock | **None.** Return services have no inventory writes. |
| Replacement inventory | **None.** Record-only resolution. |
| History / ledger | **No** `InventoryLog` / `StockMovement` model. Seller `/movements` aggregates order qty sold by day. |
| Low stock | Seller APIs + dashboard; hardcoded threshold 10; parent `stock` only. |
| Manual adjust + reason | Seller `PUT .../stock` sets absolute parent stock; reason `console.log` only. Admin via product CRUD (`stock` + `variantStock`), no reason. |
| Concurrency | **None** (no transaction, no `{ stock: { $gte } }` + `$inc`, no version guard). |
| OOS | Checks exist; search `inStock` ignores variant map. |
| Back-in-stock | Implemented; ineffective until decrement exists. |

**Classification:** stock **attribute** is reusable; inventory **lifecycle is a BUILD/ADAPT gap** (TD-016). Risk: **High**.

---

## 6. Genuine Development Gaps

Only capabilities that require new engineering (not wiring, not copy, not env):

1. **Inventory lifecycle** — decrement on sale (policy: order vs payment), restore on cancel, restock on approved return, concurrency-safe writes, persisted movement ledger with reason, variant-aware low-stock. Existing fields can be the store.
2. **Replacement fulfilment** — today ends at `manualFollowUpRequired`. Need replacement order (or equivalent fulfilment record), stock allocation, Shiprocket outbound, tracking, customer status beyond “we will contact you.”
3. **Collections as merchandising entities** — title, slug, media, product set, visibility, order, SEO. Not Key Feature codes and not `new/sale/deal/featured` labels.
4. **Occasions as merchandising entities** — Wedding / Festive / Party / Everyday (and others) as shoppable destinations with association and SEO.
5. **Shop the Look** — look CMS with desktop/mobile media, products, CTA, order, visibility.
6. **Styled by You / UGC** — curated creator/customer content with media, caption, product links, external URL, order, enable/disable, delete.
7. **Review media** (if treated as required) — no photo/video on `Review`.
8. **PhonePe refund API** — only if approved Refund Policy sends money back through PhonePe. **Do not build until HOLD is lifted.**
9. **Admin customer 360 / account status** — compose existing APIs; add status field if required.
10. **Admin invoice download** — shopper PDF exists; admin route does not.

Items 1–6 are the gaps that actually block SRS coverage. 7–10 are smaller or conditional.

---

## 7. Configuration / Integration Work

Exists in backend; needs connection or settings, not a new architecture:

| Work | What to do |
|---|---|
| Storefront HTTP client | Replace `frontend/src/lib/data.ts` mock with Express `/api/*`. Rewrite types (`regularPrice`/`salePrice`, `variantKey`/`variantCombination`, Mongo ids vs slugs). |
| Admin HTTP client | Replace `admin/src/data/*` and hardcoded `admin@imagineairy.demo` with `POST /api/admin/login` + JWT. |
| PhonePe | `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION`; confirm V2. No webhook in code — poll/cron is the designed fallback. |
| Shiprocket | API credentials, **one default pickup location**, enable reverse logistics unless `DISABLE_REVERSE_LOGISTICS`. |
| Single seller seed | One approved Seller with address (GST origin), return window, bank fields unused in UI. |
| Commission bypass | 0% or skip ledger writes; hide payout UI. |
| Product auto-approve | Bypass marketplace `approvalStatus` wait. |
| Catalogue admin | Point AAURIKAA admin at `/api/admin/products`, taxonomy, media, SKU rules, import/export. |
| Homepage CMS | Sliders, banners, grid, homepage categories, bundle — already APIs. |
| CMS / legal pages | Rebrand `StaticPageContent` from AnBazar; unpublish seller pages. |
| SiteSettings | Logo, contact, footer GSTIN, company name, SEO. |
| Tax rates | Category/product `taxRate` + HSN; admin `/api/admin/taxes`. |
| Shipping rules | Weight classes on products; zones; flat slabs; free-shipping rules. |
| Newsletter | `POST /api/newsletter/subscribe` vs frontend fake success. |
| Enquiries | `POST /api/enquiries` + `enquiryNotificationEmail`. |
| Hide marketplace | Public `/api/sellers`, seller register, commission, payout, become-seller CMS. |

**Frontend/admin compatibility (lightweight):**

| Question | Finding |
|---|---|
| APIs currently consumed | **None.** No `fetch`/`axios`/`NEXT_PUBLIC_API` in storefront or this admin. |
| Mock/local data | All catalogue, cart, checkout, UGC, looks, occasions, collections, admin CRUD. |
| Backend APIs that already exist | Products, search, taxonomy, shopper auth/cart/wishlist/orders, payment, pricing, CMS, static pages, reviews, coupons, dashboard, returns, media, settings. |
| Contract mismatches | Price shape, variant identity, category slugs vs ObjectIds, collections field with no API, guest cart vs `verifyShopper`, order/payment enums, admin statuses, comments still say “future Laravel.” |
| Screens with no backend equivalent | Collections, occasions, shop the look, UGC; guest checkout; several footer/nav routes. |
| Backend with no UI in these apps | Returns, refunds, replacements, wallet, Shiprocket, inventory ops, RBAC staff, blog, enquiries, stock notifications, import/export, taxes. |

Distinguish: **backend gap** (UGC, looks, collections, occasions, replacement fulfilment, inventory movements) vs **integration gap** (almost every other SRS area) vs **frontend/admin gap** (account, wishlist page, order history, returns UI).

---

## 8. Business Decisions / HOLD Items

Do not implement these as a technical preference:

| Item | Why HOLD |
|---|---|
| **Refund method and destination** | SRS: confirm client Refund Policy before refund workflow implementation. Code today = wallet credit only; CMS copy = original payment method; PhonePe refund = absent. |
| **Refund timelines and COD handling** | Policy text, not code. |
| **OTP-login vs password + email verification** | SRS wording is “Email OTP will be used for customer verification and authentication.” Code is password login + OTP register/reset. Confirm before adapting auth. |
| **Store identity model** | Seeded Seller vs optional `Product.seller`. |
| **Whether commission/ledger is kept at 0% for internal P&L** | Finance stack is marketplace take-rate. |
| **Guest checkout** | Not required by SRS (Customer Account exists). Frontend demo is guest; backend is not. Confirm if AAURIKAA wants guest. |
| **Review media required vs optional** | SRS: “where applicable.” |
| **Mapping occasions/collections onto taxonomy vs new entities** | New entities match SRS; taxonomy reuse is a product shortcut with SEO/UX trade-offs. |
| **Inventory decrement moment** | Order create vs payment success vs dispatch. Must be decided before TD-016 work (unpaid PhonePe currently creates orders). |

---

## 9. Technical Debt That Affects AAURIKAA Workstreams

Not a cleanup list — only items that change implementation sequencing.

| ID | Relevance |
|---|---|
| **TD-016** No inventory decrement | Blocks truthful OOS, low-stock, restock notify, cancel restore, replacement stock. **Must design before after-sales inventory.** |
| **TD-002** Public pricing API | Coupon probing / DoS on checkout quote. Rate-limit or auth before public storefront uses it. |
| **TD-003** Dual OTP | `otpService` vs `Shopper.otp` vs in-memory `otpStore` in `verifyOTP`. Directly affects account/auth adaptation. |
| **TD-005** localStorage JWT | Current AAURIKAA frontend has no JWT yet; do not copy ANBAZAR localStorage pattern blindly. |
| **TD-007** Duplicate shopper order mounts | `/api/shopper` and `/api/shopper/orders` both list orders; returns share the prefix. Integration must hit the DTO handlers, not invent a third client contract. |
| **TD-012** Delivered via poll skips commission | If commission is bypassed, residual risk is **order status dual-writers**, not payouts. |
| **TD-015** Cancel without fulfilment guards | Can cancel after shipment exists. Affects jewellery reverse-logistics cost. |
| **TD-008** In-process cron | Payment verify, Shiprocket poll, after-sales SLA — duplicate under multiple Node instances. |
| **TD-004** In-memory cache | Homepage/slider cache not shared across instances. |
| **TD-018** Dual ReturnRequest lifecycles | New cases are after_sales; legacy admin refund writes still exist. AAURIKAA admin must use the after-sales override path, not legacy complete. |
| **TD-017** Evidence upload not eligibility-bound | Support/abuse risk on return evidence. |
| Checkout coupon timing | Usage burned before payment success — financial correctness, not a TD id. |
| Variant logic duplication | Maps on Product vs Variant catalogue; storefront vs API shapes. Affects PDP/cart integration. |
| `calculateProductPricing` hardcoded 5% tax | Not the live checkout path; do not use this helper for AAURIKAA PDP totals. |

---

## 10. Areas Where Code Evidence Was Insufficient

These are not “unknown SRS sections.” They are runtime/product questions the repository cannot fully answer:

- Production PhonePe and Shiprocket accounts, webhook URLs, and whether V2 is enabled in the target environment (`phonePeService.isV2Enabled()` depends on env).
- Whether `GET /api/products/featured-categories` is dead in the running Express matcher (registered after `/:id` — likely unreachable; not runtime-tested here).
- Full OTP path parity for admin vs shopper vs seller (registry already marks this uncertain).
- Whether every admin product `findOneAndUpdate` uses `{ new: true }` so restock hooks fire.
- Live GST correctness for AAURIKAA’s actual place of supply (depends on seeded seller address).
- Whether ANBAZAR frontend (not in this repo’s `frontend/`) still consumes `/api/shopper/orders/shipping` (TD-014). Irrelevant to the current AAURIKAA Next demo, which consumes nothing.

---

## 11. Critical Path to SRS (minimum sequence)

To reach a shoppable AAURIKAA catalogue with legal checkout — **before** merchandising extras:

1. Configure store identity, GSTIN, tax rates, weight classes, shipping rules, PhonePe, Shiprocket pickup.
2. Integrate storefront auth, catalogue, cart, checkout, payment, account, orders (contract mapping).
3. Integrate admin catalogue, orders, customers, coupons, CMS, settings.
4. Adapt single-vendor GST origin + hide seller portal.
5. Implement inventory decrement/restore (policy-gated) — required for honest jewellery stock.
6. Point after-sales operations at admin; keep evidence + reverse pickup.
7. **HOLD** refund destination; do not build PhonePe refund or advertise original-method refunds until policy is signed.
8. Then build collections, occasions, looks, UGC (homepage SRS completeness).
9. Then build replacement fulfilment on top of inventory + Shiprocket.
10. QA the three money/logistics paths: checkout, fulfilment, after-sales.

Shop the Look / UGC / editorial collections are **brand-critical for the homepage SRS** but are not required to place a paid order.

---

## 12. Recommended Execution Order

### Reuse
Product engine, variants/SKU maps, media DAM, category hierarchy, search/filters, cart, wishlist, order persistence, shopper order DTOs, GST engine, zone shipping engine, PhonePe initiate/status, COD, Shiprocket forward + reverse, invoice PDF, returns eligibility/evidence/appeal, review text+moderation, enquiries, CMS/static pages, admin RBAC, back-in-stock notify pipeline, coupon calculation, import/export, blog (if editorial is wanted later).

### Configure
One Seller + pickup; PhonePe/Shiprocket/Mongo/mail env; GSTIN and tax; free-shipping rules; auto-approve products; 0% commission / hide payouts; AAURIKAA legal CMS; hide marketplace routes/pages; notification emails.

### Adapt
Inventory movements on existing fields; GST origin; fulfilment identity; after-sales operator = admin; coupon usage timing + admin limits; invoice legal entity; dashboard widgets; OTP consolidation; checkout payment methods (drop unused UPI-manual/Stripe/Razorpay from the AAURIKAA surface); customer admin composition; homepage section mapping; SiteSettings vs Seller return policy.

### Build
Collections; occasions; Shop the Look; Styled by You; replacement order/shipment/inventory; inventory ledger; review media if required; PhonePe refund **only after HOLD**.

### Integrate
Storefront and admin HTTP layers, auth cookies/headers, field mapping, replace mock cart/checkout, wire homepage to `homepage-bundle` + sliders/banners plus new merchandising APIs when built.

### QA
Concurrent checkout oversell; unpaid PhonePe + coupon; CGST vs IGST with store origin; Shiprocket AWB + customer tracking; COD; return evidence + reverse AWB; wallet credit idempotency; cancel after AWB; RBAC; CMS pages; contract tests against the Next apps.

---

## 13. Mature Module Reuse Verdict (do not rebuild)

| Module | Verdict |
|---|---|
| Catalogue / Product / Category / Variant / SKU / Media / Brand | **Reuse.** Variant stock is a Product map, not `Variant.js`. |
| Search / import-export / product SEO | **Reuse.** |
| Cart / pricing / coupon / checkout / GST / payment | **Reuse with adaptation** (auth on pricing, coupon timing, PhonePe methods, GST origin). |
| Orders / shipping / Shiprocket / customers / invoice | **Reuse** (invoice branding; admin invoice; hide seller order UI). |
| Returns | **Reuse spine**; adapt actor. |
| Wallet | **Reuse only as refund credit if policy says so.** Not checkout tender. |
| CMS / blog / homepage content / tags | **Reuse** (rebrand; blog is extra to SRS). |
| Collections / occasions / UGC / looks | **Not present — do not pretend tags or Key Features are these modules.** |

---

*End of Phase 1 audit. No implementation was started.*
