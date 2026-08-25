# ANBAZAR Multi‑Vendor E‑Commerce Platform

## Final Technical Architecture Map

Prepared For: Long‑Term Technical Governance, AI Context Preservation, Future Development Planning & Regression Prevention

---

## 1. System Overview

### 1.1 Platform Type

ANBAZAR is a distributed multi‑vendor e‑commerce marketplace platform supporting:

- Admin workflows
- Seller onboarding and management
- Shopper ordering lifecycle
- Multi‑vendor order orchestration
- GST taxation
- Shipping automation
- Payment gateway integration
- Logistics synchronization
- SEO and CMS management
- Multilingual storefront rendering
- Product variant architecture
- Seller financial management
- Commission and payout systems
- After-Sales Management (Need Help / seller review / admin governance)
- Shopper Wallet credit ledger (checkout redemption is not implemented)
- Admin operational RBAC (view/manage)
- Global storefront search

The platform has evolved beyond MVP stage and now functions as a business workflow orchestration system. The current architectural baseline includes **Scope 5** modules documented in §24. Scope 5 is completed with documented exceptions; those exceptions are status notes, not new architectural decisions.

---

## 2. Core Technology Stack

### 2.1 Frontend Stack

| Layer                  | Technology                  |
| ---------------------- | --------------------------- |
| Framework              | Next.js 14.x (Pages Router) |
| UI Library             | React 18                    |
| Styling                | Tailwind CSS                |
| State Management       | React Context               |
| API Communication      | Axios + Fetch               |
| Internationalization   | next-i18next                |
| Rich Text Editors      | TipTap + Quill              |
| Charts                 | Recharts                    |
| UI Utilities           | Headless UI                 |
| Carousel Libraries     | react-slick                 |
| Image Handling         | next/image                  |

---

### 2.2 Backend Stack

| Layer          | Technology               |
| -------------- | ------------------------ |
| Runtime        | Node.js                  |
| Framework      | Express.js               |
| Database ORM   | Mongoose                 |
| Database       | MongoDB                  |
| Authentication | JWT                      |
| Mail System    | Nodemailer               |
| Cron System    | node-cron                |
| Caching        | node-cache               |
| Upload System  | Multer + Cloudflare R2   |
| Testing        | Jest                     |

---

### 2.3 External Integrations

| Integration          | Purpose                   |
| -------------------- | ------------------------- |
| PhonePe              | Payment Gateway           |
| Shiprocket           | Logistics & Fulfillment |
| Cloudflare R2        | Storage                   |
| Cloudinary           | Image Delivery            |
| Google Translate API | Translation Automation    |

---

## 3. High-Level System Architecture

```txt
Frontend (Next.js)
    ↓
API Layer (Express Routes)
    ↓
Controllers
    ↓
Business Services / Engines
    ↓
Mongoose Models
    ↓
MongoDB

External Services:
- PhonePe
- Shiprocket
- Cloudflare R2
- Email Services
```

**Architecture Pattern:**

- Separated frontend/backend architecture.
- API-driven rendering.
- Business logic centralized primarily in backend services.
- React Context used for client-side session/cart state.
- MongoDB document-based workflow persistence.

---

## 4. Frontend Architecture

### 4.1 Frontend Structural Layout

```txt
frontend/
├── pages/
├── components/
├── context/
├── utils/
├── hooks/
├── public/
├── styles/
└── scripts/
```

---

### 4.2 Core Frontend Responsibilities

| Directory       | Responsibility              |
| --------------- | --------------------------- |
| pages/          | Route entry points          |
| components/     | Shared UI components        |
| context/        | Global state management     |
| utils/          | Frontend business utilities |
| hooks/          | Shared reusable hooks       |
| public/locales  | Translation files           |
| styles/         | Global styling              |

---

### 4.3 Routing Architecture

The platform uses Next.js Pages Router.

#### Core Route Types

| Route Type        | Example          |
| ----------------- | ---------------- |
| Product Pages     | /product/[slug]  |
| Blog Pages        | /blog/[slug]     |
| CMS Pages         | /[...slug]       |
| Seller Dashboard  | /seller/*        |
| Admin Dashboard   | /admin/*         |
| Shopper Dashboard | /shopper/*       |
| Shopper Orders (canonical tracking) | /orders |
| Shopper Wallet (credit history) | /shopper/wallet |
| Careers (public; environment-gated module) | /careers |
| Seller After-Sales | /seller/after-sales |
| Category Pages    | /category/[slug] |
| Tags Pages        | /tags/[slug]     |

`/order-tracking` redirects to `/orders`. `/orders` is the canonical shopper order and tracking surface. A legacy `/shipping` consumer may still exist and is not claimed as removed.

---

### 4.4 Frontend State Management

**Implemented Using:**

- React Context
- LocalStorage
- Server synchronization

#### Core Context Systems

| Context      | Responsibility          |
| ------------ | ----------------------- |
| CartContext  | Cart, wishlist, compare |
| OrderContext | Order state             |

#### Cart Persistence Strategy

| User Type             | Persistence        |
| --------------------- | ------------------ |
| Guest                 | localStorage       |
| Authenticated Shopper | MongoDB via API    |

---

### 4.5 Frontend Business Logic Areas

#### Variant Logic

**Location:**

```txt
frontend/utils/variantUtils.js
```

**Responsibilities:**

- Variant selection
- Combination generation
- Pricing rendering
- Stock rendering

**Critical Dependency:**

Must remain synchronized with:

```txt
backend/utils/variantUtils.js
```

---

### 4.6 Frontend SEO Architecture

**Implemented Using:**

- next/head
- Dynamic slugs
- Structured SEO fields
- next-i18next localization

**SEO Areas:**

- Product pages
- Blog pages
- CMS pages
- Category pages
- Career detail pages (when the public Career module is enabled)

---

### 4.7 Frontend Risk Areas

#### High-Risk Frontend Files

| File              | Risk                      |
| ----------------- | ------------------------- |
| checkout.js       | Payment orchestration     |
| CartContext.js    | Cart merge logic          |
| product/[slug].js | Slug + variant handling   |
| admin order pages | Logistics/payment actions |
| After-Sales / wallet services | Refund credit orchestration |

---

## 5. Backend Architecture

### 5.1 Backend Structural Layout

```txt
backend/
├── controllers/
├── services/
├── routes/
├── models/
├── middleware/
├── utils/
├── jobs/
├── config/
├── scripts/
└── tests/
```

---

### 5.2 Backend Responsibilities

| Directory    | Responsibility            |
| ------------ | ------------------------- |
| controllers/ | HTTP request handling     |
| services/    | Business engines          |
| routes/      | API registration          |
| models/      | Database schemas          |
| middleware/  | Security/auth/validation |
| utils/       | Shared helpers            |
| jobs/        | Cron reconciliation       |
| config/      | Upload/storage config     |

---

### 5.3 API Architecture

**Architecture Style:**

- REST-like Express APIs
- Domain-grouped routes
- Middleware-based authorization
- Service-oriented business execution

#### Major API Domains

| Domain     | Prefix       |
| ---------- | ------------ |
| Admin      | /api/admin   |
| Seller     | /api/seller  |
| Shopper    | /api/shopper |
| Products   | /api/products |
| Orders     | /api/orders  |
| Payment    | /api/payment |
| Shipping   | /api/shipping |
| Reviews    | /api/reviews |
| CMS        | /api/cms     |
| Newsletter | /api/newsletter |
| After-Sales (shopper) | /api/shopper/orders (return-* routes; additional mount beside shopper order routes) |
| After-Sales (seller) | /api/seller/returns |
| After-Sales (admin) | /api/admin/returns |
| Shopper Wallet | /api/shopper/wallet |
| Global Search | /api/search |
| Careers | /api/careers , /api/career-applications , /api/admin/careers |
| Settings | /api/settings |
| Sliders | /api/sliders |
| Taxonomy | /api/taxonomy , /api/categories |

Shopper After-Sales routes are registered on `/api/shopper/orders` in addition to shopper order listing/detail routes. Future work must not duplicate that prefix carelessly.

---

### 5.4 Authentication Architecture

**Authentication Method:**

- JWT-based authentication

#### Role Separation

| Role    | Middleware    |
| ------- | ------------- |
| Admin   | verifyAdmin (+ loadAdminContext + requirePermission for staff RBAC) |
| Seller  | verifySeller  |
| Shopper | verifyShopper |

**Admin RBAC (Scope 5):**

Staff admin access uses `verifyAdmin` → `loadAdminContext` → `requirePermission(domain, action)` (`backend/utils/adminAuthChain.js`). Permission catalog (`backend/config/adminPermissionCatalog.js`) is primarily **view** / **manage**, plus limited domain-specific actions (for example import, fulfill, approve) where those exist. `Admin.isActive` and `tokenVersion` support deactivation and access revocation. Super-admin remains a distinct flag on the Admin model.

Storefront account navigation exposes Shopper and Seller login only. Admin access is via the direct administrative route.

**JWT Tokens:**

- Stored in localStorage on frontend.
- Verified in backend middleware.

**Security Concern:**

- localStorage JWT architecture introduces XSS exposure risk.

---

### 5.5 Middleware Architecture

#### Global Middleware Flow

```txt
Request
→ CORS
→ JSON Parser
→ Cookie Parser
→ Maintenance Middleware
→ Rate Limit (partial)
→ Helmet
→ Route Middleware
→ Controller
→ Error Handler
```

---

### 5.6 Core Business Service Layer

The backend architecture heavily relies on service-oriented business engines.

#### Core Engines

| Service                 | Responsibility           |
| ----------------------- | ------------------------ |
| orderProcessingService  | Checkout orchestration   |
| gstEngineService        | GST calculations         |
| shippingEngineService   | Shipping logic           |
| orderFulfillmentService | Shiprocket orchestration |
| shipRocketService       | Shiprocket API layer     |
| phonePeService          | PhonePe API layer        |
| pickupLocationService   | Pickup allocation        |
| returnEligibilityService | After-Sales eligibility |
| returnRequestService    | Need Help case creation  |
| sellerReturnService     | Seller review/resolution |
| adminReturnService      | Admin review/override    |
| returnAppealService     | Shopper appeal           |
| returnRefundOrchestrationService | Refund → wallet credit |
| shopperWalletService    | Shopper wallet credit ledger |
| globalSearchService     | Storefront search suggestions |
| careerService / careerApplicationService | Career module |
| afterSalesSlaService    | After-Sales SLA reminders/escalation |

---

## 6. Database Architecture

### 6.1 Database Model

**Database Type:**

- MongoDB
- Mongoose ODM

**Architecture Type:**

- Document-oriented architecture
- Embedded + referenced relationship hybrid

---

### 6.2 Core Collections

| Collection               | Purpose                      |
| ------------------------ | ---------------------------- |
| Product                  | Product catalog              |
| Order                    | Checkout/order persistence   |
| Seller                   | Seller management            |
| Shopper                  | Shopper accounts             |
| Admin                    | Admin accounts               |
| Coupon                   | Discount logic               |
| Review                   | Ratings/reviews              |
| Commission               | Financial commissions        |
| Payout                   | Seller payouts               |
| SellerLedger             | Financial ledger             |
| ShippingZone             | Zone logic                   |
| WeightClass              | Weight calculations          |
| Tax                      | Tax structure                |
| Blog                     | Blog/CMS                     |
| NewsletterSubscription   | Subscriber storage           |
| ReturnRequest            | After-Sales cases            |
| ShopperWalletLedger      | Shopper wallet credit ledger |
| Career                   | Career postings              |
| CareerApplication        | Career applications          |

ShopperWalletLedger is **not** SellerLedger. It records shopper refund credits only.

---

### 6.3 Product Schema Highlights

#### Critical Constraints

| Field            | Constraint |
| ---------------- | ---------- |
| slug             | Unique     |
| sku              | Unique     |
| status           | Enum       |
| approvalStatus   | Enum       |

#### Embedded Structures

- Variants
- Variant pricing
- Variant stock
- Media arrays
- SEO fields (including primary keyword; publish-time uniqueness remains authoritative)
- Return policy override fields (`returnPolicyMode`, `returnAllowed`, `returnWindowDays`, `returnConditions`)

#### Workflow Role

**Acts as:**

- Catalog source of truth
- Variant source of truth
- Approval workflow anchor
- SEO rendering source

---

### 6.4 Order Schema Highlights

#### Critical Fields

- invoiceNumber
- paymentStatus
- transaction IDs
- tax snapshot
- shipping snapshot
- coupon snapshot
- embedded order items

#### Workflow Role

**Acts as:**

- Financial record
- Logistics orchestration source
- GST persistence source
- Invoice source

Order listings for shopper, seller, and admin may include an After-Sales summary (`status`, `resolution`) when a case exists.

---

### 6.5 Financial Collections

#### Commission

**Purpose:**

- Platform fee tracking
- Seller commission persistence
- Payout linkage

#### SellerLedger

**Purpose:**

- Immutable financial ledger
- Seller balance tracking

#### Payout

**Purpose:**

- Seller payout workflow
- Admin approval lifecycle

#### ShopperWalletLedger

**Purpose:**

- Immutable **credit-only** shopper wallet ledger for After-Sales refunds
- Transaction history / balance reads

**Not a checkout tender.** There is no debit/redeem API in the current architecture. Seller payout `wallet` payment-method (if present) is unrelated shopper-checkout architecture.

---

## 7. Checkout Architecture

### 7.1 Checkout Workflow

```txt
Cart
→ Checkout
→ Variant Validation
→ Coupon Validation
→ Shipping Calculation
→ GST Calculation
→ Order Creation
→ Payment Initiation
→ Payment Verification
→ Shiprocket Sync
→ Tracking Updates
```

---

### 7.2 Checkout Business Engines

| Engine                  | Responsibility         |
| ----------------------- | ---------------------- |
| variantUtils            | Variant validation     |
| pricingEngine           | Coupon/pricing         |
| shippingEngineService   | Shipping               |
| gstEngineService        | Taxation               |
| paymentController       | Payment orchestration  |
| orderFulfillmentService | Logistics sync         |

---

### 7.3 Checkout Architectural Principles

#### Critical Rule

Frontend totals are NOT trusted.

**Server recalculates:**

- pricing
- shipping
- GST
- coupon application
- variant validation

before order persistence.

Checkout does **not** redeem Shopper Wallet balance. Wallet credit is an After-Sales refund destination, not a checkout payment method.

---

## 8. Payment Architecture

### 8.1 PhonePe Workflow

```txt
Frontend Checkout
→ /api/payment/initiate
→ PhonePe Service
→ Redirect to PhonePe
→ Return to Frontend
→ /api/payment/verify
→ Order Payment Update
→ Fulfillment Trigger
```

---

### 8.2 Payment Recovery Architecture

**Implemented:**

- Payment verification cron
- Pending payment reconciliation
- Duplicate verification prevention

After-Sales refunds credit Shopper Wallet; they are **not** established as PhonePe original-tender refunds in the current After-Sales path.

**Cron System:**

```txt
paymentVerificationJob.js
```

---

### 8.3 Payment Risk Areas

| Risk                                  | Severity |
| ------------------------------------- | -------- |
| Abandoned payment state               | Medium   |
| Gateway verification race conditions  | Medium   |
| localStorage JWT exposure             | High     |

---

## 9. Shipping Architecture

### 9.1 Shipping Workflow

```txt
Order
→ Shipping Zone Resolution
→ Weight Calculation
→ Free Shipping Rules
→ Flat Shipping Rules
→ Shiprocket Sync
→ AWB Generation
→ Tracking Polling
```

Free shipping in this engine is **global / minimum-order rules and coupon free-shipping**. Product/category/subcategory/child-category free-shipping eligibility flags are **not** part of the current shipping architecture.

After-Sales reverse pickup (when a physical return is required) uses a separate reverse-logistics path and must not be confused with outbound fulfillment.

---

### 9.2 Shipping Business Engines

| Service                 | Responsibility           |
| ----------------------- | ------------------------ |
| shippingEngineService   | Shipping calculation     |
| pickupLocationService   | Seller pickup resolution |
| shipRocketService       | API integration          |
| orderFulfillmentService | Shipment orchestration   |

---

### 9.3 Shipping Zone Types

**Supported:**

- Local
- In-State
- Out-of-State
- Union Territory

---

### 9.4 Shipping Risk Areas

| Risk                             | Severity |
| -------------------------------- | -------- |
| Partial shipment sync failures   | High     |
| Missing pickup locations         | Medium   |
| Tracking status drift            | Medium   |

---

## 10. GST & Tax Architecture

### 10.1 GST Engine Responsibilities

**Implemented In:**

```txt
gstEngineService.js
```

**Calculates:**

- CGST
- SGST
- IGST
- UGST
- Inclusive tax
- Exclusive tax

---

### 10.2 GST Decision Logic

Tax selection depends on:

- seller state
- buyer state
- shipping destination
- product category
- inclusive/exclusive mode

---

### 10.3 GST Architectural Dependency

**Critical Dependency Chain:**

```txt
Shipping
→ GST Base
→ Order Total
→ Payment Amount
```

**Any GST modification can affect:**

- payment flows
- shipping totals
- payouts
- invoices

---

## 11. Product & Variant Architecture

### 11.1 Product Lifecycle

```txt
Draft
→ Pending Approval
→ Approved
→ Published
→ Archived/Trash
```

---

### 11.2 Approval Workflow

| Actor             | Responsibility                            |
| ----------------- | ----------------------------------------- |
| Seller            | Create/update product                     |
| Admin             | Approve/reject                            |
| Public Storefront | Display approved published products only  |

---

### 11.3 Variant Architecture

**Supports:**

- Multi-dimensional variants
- Variant pricing
- Variant stock
- Variant SKU
- Variant combinations

#### Critical Synchronization Rule

Frontend and backend variant engines must remain synchronized.

**Files:**

```txt
frontend/utils/variantUtils.js
backend/utils/variantUtils.js
```

---

## 12. Seller Financial Architecture

### 12.1 Financial Workflow

```txt
Order Delivered
→ Commission Calculation
→ SellerLedger Entry
→ Seller Payout Request
→ Admin Approval
→ Payout Completion
```

---

### 12.2 Commission Engine

**Implemented In:**

```txt
calculateCommission.js
```

**Supports:**

- category commission
- seller commission
- admin overrides
- default system fallback

---

### 12.3 Financial Risk Areas

| Risk                                       | Severity |
| ------------------------------------------ | -------- |
| Duplicate ledger entries                   | High     |
| Commission mismatch                        | High     |
| Transaction fallback on non-replica Mongo  | Medium   |

---

## 13. CMS & SEO Architecture

### 13.1 CMS Architecture

**Supports:**

- Dynamic pages
- Blog management
- SEO fields
- Slug rendering
- Rich text content
- Multi-category blogs
- Seller Knowledge Base static pages (Seller FAQ, Seller Help Center, Seller Training) via the existing CMS/static-page architecture
- Career public content may fall back to CMS/static pages when the new Career module flags are not enabled

Homepage sliders persist `displayOrder`; list and homepage-bundle queries sort by that order.

Taxonomy models (Category, Subcategory, ChildCategory) persist optional image, description, optional display title, and FAQ. There is no separate extended-description field in the current schema. Storefront category pages render taxonomy content and FAQ where present.

---

### 13.2 SEO Architecture

**SEO Sources:**

- Product schema
- Blog schema
- CMS schema

**SEO Features:**

- Meta title
- Meta description
- Keywords
- Slug rendering
- Structured headings
- Translation-aware rendering

---

### 13.3 Slug Architecture

**Critical Rule:**

Slug generation is backend-authoritative.

Frontend must never independently generate canonical slugs.

---

## 14. Multilingual Architecture

### 14.1 Internationalization System

**Implemented Using:**

- next-i18next
- locale JSON namespaces
- translation APIs

**Supported Languages:**

- English
- Hindi
- Bengali

---

### 14.2 Translation Storage

```txt
public/locales/
```

**Namespaces:**

- common
- dashboard
- others as needed

---

### 14.3 Multilingual Risks

| Risk                               | Severity |
| ---------------------------------- | -------- |
| Missing translation keys           | Medium   |
| SEO inconsistency between locales  | Medium   |
| Translation drift                  | Medium   |

---

## 15. Media & Upload Architecture

### 15.1 Upload Systems

**Implemented Using:**

- Multer
- Cloudflare R2
- Express static uploads

**Supports:**

- Product media
- Seller documents
- Admin uploads
- Blog media
- After-Sales evidence (photo/video via R2)
- Career application resumes (R2)

---

### 15.2 Media Risk Areas

| Risk                               | Severity |
| ---------------------------------- | -------- |
| Upload validation inconsistencies  | Medium   |
| File-type attack surface           | Medium   |
| Large upload handling              | Medium   |

---

## 16. Middleware & Security Architecture

### 16.1 Security Stack

**Implemented:**

- Helmet
- JWT validation
- CORS
- Validation middleware
- Partial rate limiting

---

### 16.2 Critical Security Risks

| Risk                           | Severity |
| ------------------------------ | -------- |
| Pricing API unauthenticated    | High     |
| Coupon enumeration risk        | High     |
| Comment spam exposure          | High     |
| localStorage JWT architecture  | High     |
| Route shadowing                | Critical |

---

### 16.3 Critical Architectural Bug

#### Commission Route Shadowing

**Problem:**

```txt
PATCH /api/commissions/:id/dispute
```

Seller route is shadowed by admin route due to Express route ordering.

**Severity:** CRITICAL

**Impact:**

Seller dispute endpoint unreachable.

---

## 17. Caching & Performance Architecture

### 17.1 Current Cache Strategy

**Implemented Using:**

```txt
node-cache
```

**Characteristics:**

- In-memory cache
- Single-instance scope
- Non-distributed architecture

---

### 17.2 Performance Risks

| Risk                                 | Severity |
| ------------------------------------ | -------- |
| Multi-instance cache inconsistency   | Medium   |
| Large route files                    | High     |
| Repeated shipping/GST recalculation  | Medium   |
| Large frontend bundles               | Medium   |

---

### 17.3 Scalability Constraints

**Current architecture limitations:**

- Single-process cron architecture
- In-memory caching
- No distributed queue system
- Heavy route/controller files

---

## 18. Background Jobs & Automation

### 18.1 Cron Systems

**Implemented:**

- Payment verification cron
- Tracking polling intervals
- After-Sales SLA reminder and admin escalation (`afterSalesSlaService`, scheduled in `server.js`; disable via `DISABLE_AFTER_SALES_SLA_CRON`)

**Files:**

```txt
jobs/paymentVerificationJob.js
```

and:

```txt
orderFulfillmentService.js
```

---

### 18.2 Operational Risks

| Risk                                           | Severity |
| ---------------------------------------------- | -------- |
| Cron duplication in multi-instance deployment | Medium   |
| Payment reconciliation race conditions         | Medium   |
| Shipment polling scalability                   | Medium   |

---

## 19. Cross-Module Dependency Analysis

### 19.1 Core Dependency Chain

```txt
Checkout
→ Pricing Engine
→ GST Engine
→ Shipping Engine
→ Payment Controller
→ Fulfillment Engine
→ Shiprocket
→ Commission Engine
→ Payout System
```

**After-Sales financial chain (separate from checkout tender):**

```txt
Order
→ After-Sales Case (ReturnRequest)
→ Resolution
→ Refund (when selected and eligible)
→ Shopper Wallet credit (ShopperWalletLedger)
```

Wallet **credit** is implemented. Wallet **checkout redemption** is not implemented.

---

### 19.2 High-Risk Dependency Areas

| Module                  | Dependency Sensitivity |
| ----------------------- | ---------------------- |
| orderProcessingService  | Critical               |
| gstEngineService        | Critical               |
| shippingEngineService   | Critical               |
| paymentController       | Critical               |
| orderFulfillmentService | Critical               |
| sellerOrderController   | Critical               |
| returnRefundOrchestrationService | Critical        |
| shopperWalletService    | High                   |

---

### 19.3 Dangerous-to-Modify Files

```txt
services/orderProcessingService.js
services/gstEngineService.js
services/shippingEngineService.js
controllers/paymentController.js
services/orderFulfillmentService.js
controllers/sellerOrderController.js
routes/commissionRoutes.js
routes/pricingRoutes.js
services/returnRefundOrchestrationService.js
services/shopperWalletService.js
utils/afterSalesCaseSpine.js
```

---

## 20. AI Development Governance Rules

### 20.1 Critical Rules

1. Never trust frontend order totals.
2. Variant logic must remain synchronized frontend ↔ backend.
3. Slug logic must remain backend-authoritative.
4. Checkout modifications require GST + shipping review.
5. Payout modifications require commission review.
6. Shiprocket changes require fulfillment review.
7. All new admin APIs must use verifyAdmin.
8. All financial changes require regression testing.
9. Pricing APIs should eventually receive stricter protection.
10. Route registration order must be carefully reviewed.
11. Do not duplicate After-Sales, Shopper Wallet, Career, or global search modules.
12. Do not treat Shopper Wallet as a checkout payment method unless a future scope implements redemption.
13. After-Sales refund and commission reversal changes require financial regression testing.
14. New admin APIs for staff must use the RBAC chain (`verifyAdmin`, `loadAdminContext`, `requirePermission`), not verifyAdmin alone, unless a documented exception applies.

---

## 21. Technical Debt Summary

### 21.1 Critical Technical Debt

| Issue                             | Severity |
| --------------------------------- | -------- |
| Commission route shadowing        | Critical |
| Pricing API exposure              | High     |
| Large blogRoutes.js architecture  | High     |
| Duplicate shopper order routes    | Medium   |
| Dual OTP systems                  | High     |
| In-memory cache architecture      | Medium   |

---

## 22. Deployment Architecture

### 22.1 Current Deployment Characteristics

**Frontend:**

- Next.js production build
- Dockerized

**Backend:**

- Express server
- Dockerized
- Environment-driven configuration

**Storage:**

- Cloudflare R2
- Local uploads fallback

---

### 22.2 Deployment Risks

| Risk                                | Severity |
| ----------------------------------- | -------- |
| Multi-instance cron duplication     | Medium   |
| Environment variable inconsistency  | Medium   |
| Cache inconsistency                 | Medium   |

---

## 23. Future Scalability Recommendations

### 23.1 Recommended Future Improvements

#### Infrastructure

- Introduce Redis/distributed cache.
- Introduce queue workers.
- Separate cron workers.
- Introduce centralized logging.

#### Security

- Replace localStorage JWT strategy.
- Protect pricing APIs.
- Introduce stronger rate limiting.
- Consolidate OTP architecture.

#### Maintainability

- Split oversized route files.
- Centralize validation.
- Standardize API wrappers.
- Improve route inventory automation.

#### Performance

- Add distributed caching.
- Reduce repeated recalculations.
- Optimize heavy frontend bundles.

---

## 24. Scope 5 Architectural Modules

This section records **verified** architectural additions from Scope 5. It does not convert Scope 5 exceptions into architectural decisions. Warranty Claims and Service Requests are not implemented workflows.

### 24.1 After-Sales Management

**Case model:** `ReturnRequest` (`caseFlow` distinguishes after-sales from legacy return/refund statuses).

**Relationship:**

```txt
Order
→ After-Sales Case (ReturnRequest)
→ Resolution (refund | replacement | repair | reject)
→ Refund (when resolution is refund and orchestration eligibility is met)
→ Shopper Wallet credit (ShopperWalletLedger)
```

**Policy resolution:** Seller return policy (`returnAllowed`, `returnWindowDays`, `returnConditions`) with optional product override (`returnPolicyMode`). Order-level eligibility aggregates line policies via `returnPolicyResolver`.

**Lifecycle (architectural):**

```txt
Seller / product return policy
→ Eligibility (delivered + window + allowed + no active/terminal case)
→ Customer Need Help (reason, description, evidence)
→ Seller Review
→ Refund / Replacement / Repair / Reject
→ Customer Appeal (on reject, when allowed)
→ Admin Review (uphold / override)
→ Final resolution
```

**Roles:** Customer (shopper), Seller, Admin.

**Primary services:** `returnEligibilityService`, `returnRequestService`, `sellerReturnService`, `returnAppealService`, `adminReturnService`, `returnRefundOrchestrationService`, `returnRefundFinancialService`, `returnNotificationService`, `afterSalesCaseSpine` / `returnStatusGuards`.

**Routes:**

| Actor | Prefix |
| ----- | ------ |
| Shopper | `/api/shopper/orders/:id/return-eligibility`, `return-request`, `return-evidence`, `return-appeal` |
| Seller | `/api/seller/returns` |
| Admin | `/api/admin/returns` |

**Reverse logistics:** When a physical return is required, reverse pickup scheduling is used (`reverseLogisticsService` / seller retry-pickup). This is inbound return logistics, not outbound replacement fulfillment.

**SLA:** `afterSalesSlaService` runs on an in-process cron (`AFTER_SALES_SLA_CRON`, default every 15 minutes unless `DISABLE_AFTER_SALES_SLA_CRON` is set).

**Replacement / Repair:** recorded resolutions with manual follow-up. Automated replacement outbound logistics is **not** a verified architectural capability.

**Storefront / dashboards:** Need Help on shopper order detail; seller `/seller/after-sales`; admin return-requests; order-list After-Sales badges.

### 24.2 Shopper Wallet

**Model:** `ShopperWalletLedger` — immutable entries, `type: refund_credit` only, idempotency key per After-Sales refund.

**Reads:** `GET /api/shopper/wallet`, `GET /api/shopper/wallet/transactions` (`shopperWalletService`). UI: `/shopper/wallet`.

**Implemented:** After-Sales refund → wallet **credit** → transaction history.

**Not implemented:** Shopper Wallet **checkout redemption**. No debit/redeem APIs. Checkout must not treat wallet balance as tender.

ShopperWalletLedger is separate from SellerLedger.

### 24.3 Admin RBAC

```txt
Request
→ verifyAdmin
→ loadAdminContext
→ requirePermission(domain, action)
→ Controller
```

Catalog: view/manage (+ limited extra actions). Staff activation/deactivation and `tokenVersion` revocation. Order-confirmation operations use dedicated order-confirmation permissions. Storefront does not expose Admin Login in account navigation.

### 24.4 Career Management

**Models:** `Career`, `CareerApplication`.

**Admin/API:** `/api/admin/careers`, `/api/admin/career-applications`, public `/api/careers`, `POST /api/career-applications`. Resume upload to R2. Notification service for applications.

**Public module gate:** both `USE_NEW_CAREER_MODULE` and `NEXT_PUBLIC_USE_NEW_CAREER_MODULE` must be `"true"`. Otherwise storefront can remain on CMS/static career content.

**Production flag activation: Unable to verify from the current repository evidence.**

### 24.5 Global Search

```txt
SearchBar / header
→ GET /api/search/suggestions
→ globalSearchService / productSearchQueryBuilder
→ Product listing /shop?q=
```

Dimensions: product name (and related product text/SKU in the query builder), category, subcategory, child category, brand, seller, tags. Matching is contains-style, not a dedicated ranking score.

### 24.6 Taxonomy content

Category, Subcategory, and ChildCategory persist optional image, description, title, and FAQ. Admin forms and category import/export include those fields. Storefront taxonomy pages render content and FAQ. No separate extended-description field exists in the schema.

### 24.7 Homepage slider ordering

`Slider.displayOrder` is the ordering source of truth. Admin updates the field; `/api/sliders` and homepage bundle sort by `displayOrder` (then createdAt/`_id` as implemented). Storefront Slider consumes that sequence.

### 24.8 Canonical shopper tracking

Canonical shopper order/tracking UX: **`/orders`**. `/order-tracking` redirects there. List/detail DTOs expose shipment/tracking summary. This does not assert that every legacy shipping page has been removed.

### 24.9 Adjacent verified wiring (not new engines)

- Site settings scripts and theme colors: `/api/settings/scripts`, `/api/settings/colors`; storefront applies via app bootstrap.
- Product merchandising SKUs + `ProductCarousel` on PDP.
- Primary keyword **advisory** availability APIs; **publish-time** uniqueness remains authoritative.

**Not architectural capabilities of Scope 5:** catalog-level free-shipping flags; Point O PageSpeed optimization (deferred); wallet checkout redemption; warranty/service-request workflows.

---

## 25. Final Architectural Assessment

The ANBAZAR platform has evolved into a highly interconnected distributed workflow system.

**The architecture now contains:**

- Financial orchestration
- Taxation engines
- Shipping engines
- Payment reconciliation
- Logistics synchronization
- Multi-role workflows
- SEO systems
- CMS systems
- Variant engines
- Approval pipelines
- Multilingual infrastructure
- After-Sales case workflow
- Shopper Wallet credit ledger (not checkout redemption)
- Admin RBAC
- Global search
- Career Management (environment-gated public module)

**The platform complexity level now requires:**

- strong governance,
- dependency awareness,
- controlled refactoring,
- architectural discipline,
- regression-aware development.

**This Technical Architecture Map should serve as:**

- the primary engineering reference,
- the AI context foundation,
- the onboarding document,
- the regression prevention guide,
- and the architectural governance source of truth.
