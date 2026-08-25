# IMAGINEAIRY — Single Vendor Ecommerce Demo
## Master Product & UX Brief

**Document status:** Working Master Specification  
**Purpose:** Governing product, UX, scope, and reusability reference for the ecommerce demo  
**Implementation owner:** Cursor  
**Product/Solution owner:** IMAGINEAIRY  
**Current phase:** Phase 1 — Demo  
**Primary demo domain:** Premium imitation jewellery  
**Future direction:** Reusable Single Vendor Ecommerce Base

---

## 1. Document Purpose

This document is the **single source of truth** for the product and UX decisions made for the IMAGINEAIRY Single Vendor Ecommerce Demo.

It consolidates the decisions made during product discovery, reference analysis, and homepage planning.

The objective is to prevent implementation drift.

Cursor should use this document to understand:

- What we are building
- Why we are building it
- What is in scope
- What is explicitly out of scope
- What has already been decided
- Which decisions are locked
- Which decisions are implementation choices
- How the homepage should behave
- How the demo should evolve into a reusable client base

If this document conflicts with an individual implementation prompt, the **locked decisions in this document take precedence** unless the product owner explicitly changes them.

---

## 2. Product Vision

IMAGINEAIRY wants to create a **premium, reusable single-vendor ecommerce storefront** that can significantly reduce the time required to deliver future ecommerce projects.

The system is **not SaaS**.

Each future client will have:

- Their own repository
- Their own database
- Their own deployment
- Their own branding
- Their own content
- Their own customization
- Independent maintenance

The objective is to reuse proven product and engineering work — not to operate multiple clients from one application.

The desired future workflow is:

```text
Prospect
   ↓
Show Ecommerce Demo
   ↓
Client approves
   ↓
Clone Single Vendor Base
   ↓
Apply branding / theme / content
   ↓
Connect Laravel backend
   ↓
Add client-specific requirements
   ↓
Deploy
   ↓
Maintain independently
```

A new client should primarily require:

```text
Configuration
+
Content
+
Branding
+
Small targeted customization
```

rather than:

```text
Rewrite components
+
Modify many pages
+
Introduce regressions
```

---

## 3. Current Product Context

The immediate product is a **premium imitation-jewellery ecommerce demo**.

This is **fashion/imitation jewellery**, not real gold or silver jewellery.

The demo should communicate:

- Premium presentation
- Fashion
- Aspiration
- Styling
- Visual discovery
- Modern ecommerce UX
- Strong product merchandising

It should not position the experience as a precious-metals jewellery platform.

The initial demo should be flexible enough to later demonstrate other retail categories, particularly:

- Jewellery
- Fashion
- General retail

The underlying functionality should be reusable even when the visual identity changes substantially.

---

## 4. Technology Direction

The future single-vendor production architecture is:

```text
Next.js Storefront
       ↓
Laravel API
       ↓
MySQL
```

The existing Laravel backend is mature and **must not be rewritten** merely because the storefront is being rebuilt.

The new storefront is being created in **Next.js** because:

- It is the preferred frontend technology for this initiative.
- It provides a modern React ecosystem.
- It is the preferred direction for future storefront standardization.
- The existing Angular storefront is difficult to work with and has known performance concerns.

The Angular Russian Kyzyl storefront is therefore a **functional and UX reference**, not a code-conversion target.

We are NOT mechanically converting Angular code into React.

---

## 5. Current Phase — Demo First

The immediate objective is a **separate ecommerce demo repository**.

The demo does not require a backend.

It may use:

- Mock data
- Local JSON
- Static content
- Dummy interactions

The purpose of the demo is to:

1. Demonstrate the quality of the ecommerce experience to prospective clients.
2. Validate the visual and UX direction.
3. Establish reusable frontend components.
4. Create the foundation for the future Single Vendor Base.

The Laravel backend will be connected only after the direction is approved and the production implementation begins.

---

## 6. Scope Boundaries

### In Scope

For the current demo:

- Premium imitation-jewellery storefront
- Next.js frontend
- Homepage
- Category/listing experience
- Product details
- Search experience
- Cart
- Checkout UI
- Wishlist
- Customer account UI
- Responsive mobile experience
- Reusable product/category components
- Mock commerce interactions
- Configurable branding/content direction

### Later

- Laravel API integration
- Real product/catalog data
- Real customer accounts
- Real checkout
- Real payments
- Real shipping
- Real order lifecycle
- Client-specific requirements
- Independent client deployments

### Explicitly Out of Scope

- Multi-vendor marketplace
- Seller dashboard
- SaaS architecture
- Multi-tenant infrastructure
- Marketplace commission logic
- Marketplace seller workflows
- Backend rewrite
- AI processing inside Laravel
- Complex page-builder/CMS platform for the frontend
- Unnecessary abstraction or overengineering

Advanced functionality such as AI-powered virtual try-on may later be integrated through external services. It is not part of the current demo scope.

---

## 7. Core Product Principle

### Reusable does not mean generic.

The reusable base must be capable of producing substantially different websites.

For example:

```text
Same Base
   ├── Luxury Jewellery Website
   ├── Fashion Website
   ├── Furniture Website
   └── General Retail Website
```

The underlying commerce and presentation concepts can be reused while:

- Branding
- Typography
- Colours
- Photography
- Content
- Navigation
- Homepage composition
- Product presentation
- Editorial treatment

can vary significantly.

The objective is **controlled reuse**, not a visually generic template.

---

## 8. Reference Intelligence

Three major sources informed the current direction.

### 8.1 Rubans

Rubans is a market reference for:

- Fashion-forward ecommerce
- Visual merchandising
- Product discovery
- Shop the Look
- Visual category presentation
- Collection merchandising
- Strong commercial CTAs
- Lifestyle product photography

Rubans should **not** be copied mechanically.

Do not copy:

- Exact layouts
- Exact section order
- Exact copy
- Exact visual identity
- Exact card design
- Exact navigation
- Exact interactions

Rubans provides **market patterns**, not a design specification.

### 8.2 Aurikaa

Aurikaa is a market reference for:

- Jewellery storytelling
- Campaign-led presentation
- Occasion-based discovery
- Collection storytelling
- Brand-world creation
- Editorial presentation
- Brand story

Aurikaa demonstrates a more brand-led and occasion-aware jewellery experience.

Again, it is a source of patterns, not a template.

### 8.3 Russian Kyzyl

Russian Kyzyl is an existing single-vendor lingerie/innerwear ecommerce project created by IMAGINEAIRY.

It is valuable because it provides **proven ecommerce functionality and product thinking**.

The existing audit identifies substantial capabilities including:

- Product/variant management
- Category browsing
- Search
- Cart
- Minicart
- Wishlist
- Guest checkout
- OTP authentication
- Coupons
- Payments
- Shipping
- Order management
- Tracking
- Reviews
- CMS
- SEO
- Newsletter
- Google Shopping
- UGC
- Product videos
- Customer account
- Responsive behaviour

The existing product flow is broadly:

```text
Home
 ↓
Category / Search
 ↓
Product
 ↓
Cart / Minicart
 ↓
Guest / OTP Checkout
 ↓
Order Confirmation
 ↓
Tracking
```

The new Next.js storefront should learn from these capabilities without inheriting the Angular implementation.

#### Preserve conceptually

- Product/variant behaviour
- Product cards
- Quick add
- Quick view where useful
- Wishlist
- Minicart
- Free-shipping progress
- Inline variant editing
- PDP purchase flow
- Sticky purchase CTA
- Reviews
- Coupon behaviour
- Guest checkout concept
- Shipping/tracking
- Order lifecycle
- Loading/error/empty states
- SEO discipline

#### Rebuild natively in Next.js

- Entire storefront UI
- Header/navigation
- Homepage
- Category pages
- Search
- PDP
- Cart
- Checkout
- Account
- Wishlist
- Order pages
- Responsive UX
- Product card system
- Filters
- Loading/error/empty states

#### Do not carry forward blindly

- Angular architecture
- jQuery DOM manipulation
- Weak/legacy authentication patterns
- Lingerie-specific taxonomy
- Hardcoded brand content
- Orphaned seller functionality
- Stub components
- Dormant integrations
- Legacy implementation constraints

The Russian Kyzyl backend remains the future commerce backend unless a specific product decision changes this.

---

## 9. Homepage Strategy

The homepage is not intended to be a random collection of banners and product grids.

It should support multiple discovery modes.

The intended customer journey is:

```text
Attract
   ↓
Discover
   ↓
Explore
   ↓
Get Inspired
   ↓
Find an Aesthetic
   ↓
Find an Occasion
   ↓
See Social Proof
   ↓
Validate
   ↓
Connect
   ↓
Trust / Convert
```

Each section must have a distinct commercial or UX purpose.

Do not add sections merely because competitor websites have them.

Do not make every section visually heavy.

---

## 10. Locked Homepage Architecture

The current homepage architecture is:

```text
01  Announcement
02  Header / Navigation
03  Hero
04  Shop by Category
05  New Arrivals
06  Campaign Banner — Collection / Seasonal
07  Shop the Look
08  Collection Stories
09  Campaign Banner — Editorial / Lifestyle
10  Shop by Occasion
11  Styled by You
12  Bestsellers
13  Brand Story
14  Trust / Service Benefits
15  Join the Edit
16  Footer
```

The sections below are **LOCKED at the product/UX level**.

Cursor may choose implementation details, but should not reinterpret their purpose without approval.

---

## 11. Section 01 — Announcement

**Status:** LOCKED

Purpose:

- Communicate a concise promotional/service message.

This is a lightweight section.

It should not dominate the page.

Content must eventually be configurable.

---

## 12. Section 02 — Header / Navigation

**Status:** LOCKED at functional level

Purpose:

- Brand identity
- Primary navigation
- Search
- Account
- Wishlist
- Cart
- Mobile navigation

The exact implementation and final visual treatment are implementation/design choices within the overall premium direction.

The header should be:

- Clean
- Premium
- Easy to scan
- Responsive
- Appropriate for fashion ecommerce

Do not overcomplicate navigation.

---

## 13. Section 03 — Hero

**Status:** LOCKED

### Purpose

Create immediate aspiration and establish the brand's personality.

### Decision

The hero is:

- Static
- Editorial
- Image-led
- Premium
- Concise
- CTA-driven

There should be **no hero carousel** in the initial demo.

### Content hierarchy

```text
Image
  ↓
Emotion
  ↓
Short message
  ↓
Primary CTA
```

The photography should do most of the selling.

Do not turn the hero into an information-heavy promotional banner.

### Configurable

Eventually:

- Desktop image
- Mobile image
- Eyebrow
- Heading
- Supporting text
- Primary CTA
- Optional secondary CTA
- Text alignment
- Overlay/position treatment

### Reusable component

`Hero`

---

## 14. Section 04 — Shop by Category

**Status:** LOCKED

### Reference

Use the **Russian Kyzyl category section as the structural starting point**.

Use Rubans/Aurikaa as inspiration for the quality and editorial treatment of imagery.

### Purpose

Help customers enter the catalogue through visually recognizable product categories.

### Format

Desktop:

```text
Shop by Category                              Shop All →

[ Category ] [ Category ] [ Category ] [ Category ]
```

Mobile:

```text
Shop by Category

[ Category ][ Category ] →
```

### Design principles

- Large lifestyle imagery
- Rounded cards
- Minimal typography
- Premium editorial photography
- Subtle interaction
- Horizontal scrolling where appropriate
- `Shop All →`

### Important

The component must be industry-neutral.

Do not build a component that assumes jewellery.

### Reusable component

`CategoryShowcase`

### Configuration

- Heading
- CTA
- Categories
- Images
- Destination URLs
- Order
- Visible count

---

## 15. Section 05 — New Arrivals

**Status:** LOCKED

### Purpose

Primary product merchandising.

The customer should immediately see what is new after category discovery.

The progression is:

```text
Inspire
 ↓
Browse
 ↓
Discover what's new
```

### Format

Desktop:

- Four-column product presentation.

Mobile:

- Horizontal product carousel.

### Product photography

Lifestyle/worn photography is preferred where suitable.

The customer should be able to understand how the jewellery looks when worn.

### Product card principles

The card should be image-first and visually quiet.

Hierarchy:

```text
Image
 ↓
Wishlist
 ↓
Optional badge
 ↓
Product name
 ↓
Price
 ↓
Optional discount
```

Avoid excessive metadata and large permanent buttons.

### Supported interactions

- Wishlist
- Product navigation
- Optional quick add
- Optional secondary-image hover
- Optional quick view

Quick Add should not permanently clutter the card.

### Badges

Support a restrained badge system such as:

- NEW
- BESTSELLER
- TRENDING
- SALE
- SOLD OUT

Normally only one prominent badge should be shown.

### Reusability

The component should not be called `NewArrivalsSection`.

Use:

`ProductShowcase`

with collection-driven data.

Example concept:

```text
collection = "new-arrivals"
```

The same component should later support:

- Best Sellers
- Trending
- Featured
- Festive Edit
- Editor's Picks

---

## 16. Section 06 — Campaign Banner — Collection / Seasonal

**Status:** LOCKED

### Purpose

Provide a focused mid-page campaign moment that promotes a collection, seasonal edit, or commercial push after New Arrivals and before Shop the Look.

This is **not** another product grid and **not** a second hero.

It answers:

> "What collection or seasonal story should I enter now?"

### Distinction

```text
Hero
→ Primary brand opening

New Arrivals
→ Product merchandising

Campaign Banner — Collection / Seasonal
→ Focused commercial / seasonal campaign push

Shop the Look
→ Styling inspiration
```

### Format

Full-width campaign presentation.

Typical content:

- Strong campaign/collection image
- Optional mobile image
- Short heading
- Optional supporting copy
- Clear CTA
- Destination into a collection, seasonal edit, or listing

Do not turn this into a multi-card carousel in the initial demo.

### Placement

Keep this section **after New Arrivals** and **before Shop the Look**.

### Reusable component

`CampaignBanner`

Use a controlled variant/type such as:

```text
type = "collection-seasonal"
```

The component understands campaign banners, not jewellery-specific campaigns.

### Configurable

- Type / variant
- Heading
- Supporting copy
- Image
- Mobile image
- CTA
- Destination
- Visibility

---

## 17. Section 07 — Shop the Look

**Status:** LOCKED

### Purpose

Convert fashion inspiration into product discovery.

This section is **not another product carousel**.

It answers:

> "How can I wear these pieces?"

rather than:

> "What products can I buy?"

### Experience

Use editorial/lifestyle looks connected to products.

The demo should present:

- Strong model/lifestyle imagery
- Fashion-forward styling
- Optional short title
- Optional supporting text
- CTA
- Associated products conceptually

### Desktop

Approximately three prominent looks.

### Mobile

Swipeable look cards.

### Demo scope

Keep interactions simple.

Do not introduce complex image hotspots unless explicitly approved later.

A look can lead to a relevant collection/listing or other simple destination.

### Content model concept

```text
Look
├── Title
├── Image
├── Mobile Image
├── Description
├── CTA
├── Destination
└── Products
```

### Reusable component

`ShopTheLook`

This should remain industry-neutral.

---

## 18. Section 08 — Collection Stories

**Status:** LOCKED

### Purpose

Allow customers to discover the brand through aesthetics, themes and curated stories.

Distinction:

```text
New Arrivals
→ Products

Shop the Look
→ Styling

Campaign Banner — Collection / Seasonal
→ Focused campaign push

Collection Stories
→ Aesthetic / world
```

### Format

Large editorial collection cards.

Desktop:

- Two large cards per row.

Mobile:

- Large swipeable/single-card presentation where appropriate.

### Content

Each card may contain:

- Strong campaign/lifestyle image
- Collection name
- Optional short description
- CTA

Do not show a product grid inside the collection card.

The customer enters the relevant collection/listing.

### Example jewellery collections

- The Pearl Edit
- The Festive Edit
- Everyday Gold
- Statement Jewellery

These are demo content examples, not hardcoded assumptions.

### Reusability

Use:

`CollectionStories`

The component understands collections, not jewellery-specific collections.

---

## 19. Section 09 — Campaign Banner — Editorial / Lifestyle

**Status:** LOCKED

### Purpose

Provide a second campaign moment with a more editorial or lifestyle tone after Collection Stories and before Shop by Occasion.

This is **not** a product merchandising section and **not** a multi-collection story grid.

It answers:

> "What brand world or lifestyle mood should I enter next?"

### Distinction

```text
Campaign Banner — Collection / Seasonal
→ Commercial / seasonal / collection push

Collection Stories
→ Multiple aesthetic entry points

Campaign Banner — Editorial / Lifestyle
→ Single editorial / lifestyle campaign moment

Shop by Occasion
→ Occasion-led discovery
```

### Format

Full-width editorial campaign presentation.

Typical content:

- Strong lifestyle/editorial image
- Optional mobile image
- Short heading
- Optional supporting copy
- Clear CTA
- Destination into a lifestyle edit, lookbook-style collection, or curated listing

Do not turn this into a product carousel or multi-card story module in the initial demo.

### Placement

Keep this section **after Collection Stories** and **before Shop by Occasion**.

### Reusable component

`CampaignBanner`

Use a controlled variant/type such as:

```text
type = "editorial-lifestyle"
```

Both campaign-banner positions should reuse the same component with different content and type.

### Configurable

- Type / variant
- Heading
- Supporting copy
- Image
- Mobile image
- CTA
- Destination
- Visibility

---

## 20. Section 10 — Shop by Occasion

**Status:** LOCKED

### Placement

Keep this section **after Collection Stories**.

This is the agreed Option A.

The Editorial / Lifestyle campaign banner sits between Collection Stories and this section.

Final progression:

```text
Shop the Look
   ↓
Collection Stories
   ↓
Campaign Banner — Editorial / Lifestyle
   ↓
Shop by Occasion
```

### Purpose

Help customers discover jewellery based on the moment or context in which they intend to wear it.

The distinction is:

```text
Category
→ What is it?

Collection
→ What aesthetic do I like?

Occasion
→ When / why will I wear it?
```

### Initial demo occasions

- Wedding
- Festive
- Party
- Everyday

Do not overload the homepage with too many occasions.

### Visual treatment

Occasion should feel editorial and contextual.

The imagery should communicate the occasion visually.

Examples:

- Wedding → wedding/festive styling
- Festive → celebration/traditional styling
- Party → evening/glamorous styling
- Everyday → contemporary casual styling

### Format

Desktop:

- Four-card horizontal showcase.

Mobile:

- Horizontal scrolling.

This section should be **more compact than Collection Stories**.

### Reusable component

`OccasionShowcase`

### Destination

Each occasion should lead to a curated occasion collection/listing, not merely expose a raw filter.

---

## 21. Section 11 — Styled by You

**Status:** LOCKED

### Purpose

Provide authentic social proof and demonstrate how products look in real-world use.

The preferred concept is:

> **Styled by You**

This is not simply a generic Instagram feed.

### Content

- Customer/creator imagery
- Optional short-form video
- Optional creator/customer name
- Optional caption
- Optional product association
- Optional Shop the Look interaction

### Important distinction

```text
Shop the Look
→ Professional/curated styling inspiration

Styled by You
→ Real-world/social validation
```

Do not merge these concepts.

### Format

Desktop:

- Approximately four to five visual content cards.

Mobile:

- Horizontal swipe.

### Demo

Mock UGC content is sufficient.

Real social integration comes later.

### Reusable component

`UGCGallery` or `SocialProofGallery`

The underlying model should support:

```text
UGCContent
├── Image
├── Video
├── Creator
├── Caption
├── Products
└── Destination
```

---

## 22. Section 12 — Bestsellers

**Status:** LOCKED

### Purpose

Provide a second product merchandising layer that communicates proven demand.

The distinction is:

```text
New Arrivals
→ What's new?

Bestsellers
→ What's proven?
```

### Format

Use a more compact **horizontal product carousel** rather than another large product grid.

```text
BESTSELLERS                              Shop All →

[ Product ] [ Product ] [ Product ] [ Product ] →
```

### Product card

Use the same `ProductCard` established for New Arrivals.

Do not create a second product-card design.

### Data

Collection-driven:

```text
collection = "best-sellers"
```

The same mechanism can later support:

- Trending
- Most Loved
- Customer Favourites

### Reusable component

`ProductShowcase`

---

## 23. Section 13 — Brand Story

**Status:** LOCKED

### Purpose

Communicate:

> Who is this brand, and why should I care?

The section should be brand-led but restrained.

It should not assume that every client has a heritage/manufacturing story.

### Format

Preferred presentation:

- Split editorial layout
- Image
- Short story
- CTA

Conceptually:

```text
[ Brand Image ]   [ OUR STORY
                    Short brand message
                    Explore → ]
```

### Configurable

- Eyebrow
- Heading
- Description
- Image
- CTA
- Destination

### Reusability

Use:

`BrandStory`

The section is optional in the reusable base.

---

## 24. Section 14 — Trust / Service Benefits

**Status:** LOCKED

### Purpose

Reduce purchase anxiety after the discovery/merchandising journey.

This should be a lightweight section, not another large visual campaign.

### Suggested structure

```text
Free Shipping
Easy Returns
Secure Payments
Customer Support
```

Exact benefits should be configurable.

Each may contain:

- Icon
- Title
- Short description

### Design

- Compact
- Clean
- Responsive
- Minimal

### Reusable component

`TrustStrip`

Do not create a large standalone payment section in addition to this.

Payment information can also appear naturally in checkout/footer.

---

## 25. Section 15 — Join the Edit

**Status:** LOCKED

### Purpose

Provide a lower-friction conversion path for visitors who are not ready to purchase.

The section should feel like a final invitation into the brand rather than a generic newsletter form.

Example positioning:

> Join the Edit

> Get first access to new collections, exclusive offers and styling inspiration.

### Demo

UI and dummy interaction only.

Real email integration is later.

### Reusable component

`NewsletterSection`

### Configurable

- Heading
- Supporting copy
- Input label/placeholder
- CTA
- Success message

---

## 26. Section 16 — Footer

**Status:** LOCKED at information-architecture level

The footer should include appropriate groups such as:

### Brand

- Logo
- Short description

### Shop

- New Arrivals
- Jewellery
- Collections
- Best Sellers
- Gifts

### Customer Care

- Contact
- Shipping
- Returns
- FAQs

### About

- Our Story
- Other appropriate links

### Connect

- Instagram
- Facebook
- Other relevant channels
- WhatsApp where appropriate

### Legal

- Privacy
- Terms
- Refund/Return Policy

Business-specific information must ultimately be configurable.

Use a reusable:

`Footer`

---

## 27. Homepage Visual Rhythm

Not every section should carry the same visual weight.

### Heavy visual sections

- Hero
- Shop by Category
- Campaign Banner — Collection / Seasonal
- Shop the Look
- Collection Stories
- Campaign Banner — Editorial / Lifestyle
- Shop by Occasion
- Styled by You

### Medium sections

- New Arrivals
- Bestsellers
- Brand Story

### Light sections

- Announcement
- Trust
- Newsletter
- Footer

The homepage should breathe.

Do not turn every section into a full-screen banner.

---

## 28. Core Reusable Components

The initial conceptual component vocabulary is:

```text
Hero
Header
CategoryShowcase
ProductShowcase
ProductCard
CampaignBanner
ShopTheLook
CollectionStories
OccasionShowcase
UGCGallery
BrandStory
TrustStrip
NewsletterSection
Footer
```

These are conceptual responsibilities.

Cursor should not create unnecessary abstractions merely to make the architecture appear sophisticated.

---

## 29. Component Design Philosophy

A component should be reusable because its **responsibility is stable**, not because every possible future variation has been abstracted.

Prefer:

```text
Simple composition
+
Clear props/data
+
Controlled variants
```

Avoid:

```text
Generic page builder
+
Huge configuration engine
+
Excessive abstraction
+
Premature plugin architecture
```

Do not create a full frontend CMS/page builder.

Do not build a design-system framework before it is necessary.

---

## 30. Configuration Philosophy

Client-specific information should be separated from presentation wherever practical.

Potential configurable areas include:

- Logo
- Brand name
- Colours
- Fonts
- Navigation
- Homepage sections
- Hero content
- Campaign banners
- Categories
- Collections
- Products
- Contact information
- WhatsApp number
- Social links
- SEO metadata
- Store information

The homepage may conceptually be composed through controlled configuration:

```ts
homepageSections = [
  { type: "hero" },
  { type: "category-showcase" },
  { type: "product-showcase", collection: "new-arrivals" },
  { type: "campaign-banner", variant: "collection-seasonal" },
  { type: "shop-the-look" },
  { type: "collection-stories" },
  { type: "campaign-banner", variant: "editorial-lifestyle" },
  { type: "occasion-showcase" },
  { type: "ugc-gallery" },
  { type: "product-showcase", collection: "best-sellers" },
  { type: "brand-story" },
  { type: "trust-strip" },
  { type: "newsletter" }
]
```

This is an example of controlled composition, not a requirement to implement a page-builder system.

---

## 31. Visual Direction

The overall visual direction is:

- Premium
- Editorial
- Image-led
- Fashion-forward
- Elegant
- Clean
- Spacious
- Modern
- Restrained
- High-quality photography
- Strong product presentation

The visual language should suit premium imitation jewellery.

Avoid making it:

- Cheap-looking
- Overly decorative
- Overloaded with gold effects
- Excessively ornate
- Generic SaaS-like
- Template-like
- Excessively promotional

The imagery should carry much of the emotional value.

---

## 32. Mockup Reference

A generated homepage mockup may be supplied separately as a **visual glance/reference**.

The mockup is NOT a pixel-perfect specification.

It does not override this document.

If the mockup conflicts with the written product/UX brief:

> **The written brief wins.**

The mockup is useful for:

- Overall visual rhythm
- Density
- Hierarchy
- Premium feel
- General section relationships

It must not be treated as a literal specification for:

- Exact copy
- Exact colours
- Exact typography
- Exact component behaviour
- Exact number of products
- Exact section implementation

---

## 33. Responsive Principles

The storefront must provide a strong mobile experience.

Responsive behaviour is not simply "desktop scaled down."

Important patterns include:

- Mobile-specific hero image where appropriate
- Mobile-specific campaign-banner image where appropriate
- Horizontal category scrolling
- Horizontal product carousels
- Swipeable Shop the Look
- Swipeable UGC
- Compact navigation
- Touch-friendly controls
- Sticky purchase actions where appropriate
- No horizontal overflow
- Clear visual hierarchy

The final mobile design should preserve the commercial intent of the desktop experience.

---

## 34. Product Card Standard

`ProductCard` is a core reusable component.

It will be used across:

- New Arrivals
- Bestsellers
- Category listing
- Search
- Recommendations
- Related products
- Wishlist
- Other product merchandising

The card should support, as appropriate:

- Primary image
- Secondary image
- Wishlist
- Badge
- Product name
- Price
- Original price
- Discount
- Stock state
- Quick Add
- Variant interaction where required

Do not create separate visual product-card implementations for every section unless there is a genuine UX reason.

---

## 35. Data Strategy for the Demo

The demo should use mock/local data.

The data should nevertheless resemble the future commerce domain.

Conceptual data areas include:

```text
Product
Variant
Category
Collection
Look
Occasion
Campaign
UGC Content
Brand Content
Homepage Section
```

The UI should not be tightly coupled to hardcoded text embedded inside components.

Where practical, components should consume data rather than contain client-specific content.

---

## 36. Future Backend Boundary

The eventual architecture is:

```text
Next.js
   ↓
Laravel API
   ↓
MySQL
```

The UI should be designed so that the source of data can eventually change from:

```text
Mock Data
```

to:

```text
Laravel API
```

without requiring a complete rewrite of presentation components.

Do not implement backend integration in the current demo unless explicitly requested.

---

## 37. Scope Firewall

Cursor must not independently expand the scope.

Do not introduce:

- Marketplace features
- Seller features
- SaaS architecture
- Multi-tenancy
- Backend implementation
- Payment integrations
- Shipping integrations
- AI integrations
- Complex CMS
- Complex analytics infrastructure
- Unrequested authentication architecture
- Unrequested infrastructure work

If a potentially useful feature is discovered, keep it out of the current implementation unless explicitly approved.

---

## 38. Decision Status Convention

### LOCKED

The product decision has been made.

Cursor must implement it as specified.

Do not reinterpret it without explicit approval.

### OPEN

The product decision is not finalized.

Cursor should not make a major product decision on its own.

### IMPLEMENTATION CHOICE

The product outcome is defined, but Cursor may select the simplest suitable technical implementation.

### OUT OF SCOPE

Do not implement.

---

## 39. Current Decision Register

| Decision | Status |
|---|---|
| Single-vendor ecommerce | LOCKED |
| No SaaS architecture | LOCKED |
| No marketplace | OUT OF SCOPE |
| Next.js storefront | LOCKED |
| Laravel remains backend | LOCKED |
| Demo uses mock data | LOCKED |
| Static hero | LOCKED |
| No hero carousel | LOCKED |
| Kyzyl-inspired category structure | LOCKED |
| New Arrivals as first product section | LOCKED |
| ProductShowcase as reusable merchandising component | LOCKED |
| Campaign Banner — Collection / Seasonal | LOCKED |
| Shop the Look | LOCKED |
| Collection Stories | LOCKED |
| Campaign Banner — Editorial / Lifestyle | LOCKED |
| Occasion after Collections | LOCKED |
| Styled by You / UGC | LOCKED |
| Bestsellers | LOCKED |
| Brand Story | LOCKED |
| Trust / Service Benefits | LOCKED |
| Join the Edit | LOCKED |
| Footer | LOCKED |
| Controlled homepage composition | LOCKED |
| Full page-builder architecture | OUT OF SCOPE |
| Backend integration in demo | OUT OF SCOPE |
| AI implementation | OUT OF SCOPE |
| Multi-vendor functionality | OUT OF SCOPE |

---

## 40. Engineering Philosophy

The engineering implementation should follow these principles:

1. **Do not overengineer.**
2. Prefer simple solutions.
3. Use modern Next.js/React practices.
4. Keep components understandable.
5. Keep client-specific content separate from presentation where practical.
6. Avoid unnecessary dependencies.
7. Avoid premature abstractions.
8. Preserve accessibility.
9. Preserve responsive behaviour.
10. Keep performance in mind.
11. Do not introduce architectural complexity without a clear product benefit.
12. Do not modify unrelated modules while implementing a focused task.

---

## 41. Cursor Operating Rules

Before starting implementation:

1. Read this document.
2. Identify all relevant `LOCKED` decisions.
3. Understand the scope boundary.
4. Inspect the existing project before making structural decisions.
5. Do not assume that the visual mockup overrides written requirements.
6. Implement only the requested task.
7. Do not introduce unrelated functionality.
8. If an implementation choice is ambiguous but the product requirement is clear, choose the simplest robust implementation.
9. If a product decision is genuinely ambiguous, stop and ask rather than inventing a new direction.
10. Do not silently change a locked decision.

---

## 42. Standard Cursor Prompt Preamble

Future implementation prompts should begin with:

```md
## Governing Specification

Before making any changes, read:

`ECOMMERCE_DEMO_MASTER_BRIEF.md`

This document is the source of truth for the product and UX
decisions for this project.

Treat all decisions marked `LOCKED` as non-negotiable.

Do not reinterpret, simplify, expand, or replace a locked
product decision without explicit approval.

Where the brief leaves an implementation decision open,
choose the simplest robust solution consistent with the
existing project.

Do not introduce functionality outside the current task.
```

The task-specific instructions should then follow.

---

## 43. Definition of Done — Demo

The demo should ultimately satisfy:

### Product

- Premium imitation-jewellery positioning is clear.
- The experience feels like a real ecommerce brand.
- Shopping journeys are convincing.
- The homepage has distinct merchandising/discovery purposes.

### Homepage

- All locked homepage sections are implemented.
- Sections have appropriate visual rhythm.
- No unnecessary sections have been added.
- Section purposes remain distinct.

### Reusability

- Core components are reusable.
- Product cards are shared.
- Category presentation is reusable.
- Homepage sections are composable.
- Client-specific content is not unnecessarily embedded inside components.
- Jewellery-specific assumptions do not leak into generic component architecture.

### UX

- Responsive desktop/mobile experience.
- Clear navigation.
- Strong product discovery.
- Clear CTAs.
- Appropriate loading/empty/error states.
- Touch-friendly mobile interaction.
- No horizontal overflow.

### Scope

- No backend required for demo.
- No marketplace.
- No SaaS.
- No unnecessary infrastructure.
- No unrelated feature work.

### Quality

- Clean Next.js implementation.
- Maintainable component structure.
- Reasonable performance.
- Accessible interactions.
- No unnecessary technical complexity.

---

## 44. Final Product Principle

The goal is not:

> "Build a beautiful jewellery homepage."

The goal is:

> **Build a premium ecommerce storefront that is convincing enough to sell to a client today and structured well enough to become IMAGINEAIRY's reusable Single Vendor Base tomorrow.**

The demo should therefore balance:

```text
Premium UX
+
Strong merchandising
+
Real ecommerce behaviour
+
Reusable components
+
Fast customization
+
Simple architecture
```

without sacrificing one in pursuit of another.

---

## 45. Current State

The master product and UX direction is now sufficiently defined for
continued implementation.

The homepage architecture is locked, including:

- Campaign Banner — Collection / Seasonal
- Campaign Banner — Editorial / Lifestyle

The implementation is proceeding incrementally through controlled
waves.

The current implementation must continue to use this document as the
source of truth.

Before starting a new implementation wave, confirm that the proposed
work is consistent with the locked homepage architecture and scope
boundaries above.

Do not begin backend integration unless explicitly approved.

Do not begin marketplace work.

Do not build a page builder.

Do not silently change any locked product or UX decision.
