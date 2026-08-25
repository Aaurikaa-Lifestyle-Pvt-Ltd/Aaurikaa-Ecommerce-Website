# IMAGINEAIRY — Single Vendor Ecommerce

A premium imitation-jewellery ecommerce **demo**, built in Next.js, intended to
become IMAGINEAIRY's reusable **Single Vendor Ecommerce Base**.

The governing product/UX specification is
[`docs/ECOMMERCE_DEMO_MASTER_BRIEF.md`](docs/ECOMMERCE_DEMO_MASTER_BRIEF.md).
It is the source of truth; decisions marked `LOCKED` are non-negotiable.

## Status

**Task 01 — Project Discovery & Foundation.** The project scaffold, structure,
domain model, configuration and mock-data seam are in place. Homepage sections
are **not** built yet.

## Tech

- Next.js 16 (App Router) + React 19
- TypeScript
- Tailwind CSS v4
- ESLint
- Mock/local data only (no backend in the demo)

## Getting started

```bash
npm run dev     # start the dev server
npm run build   # production build
npm run lint    # lint
```

## Project structure

```text
src/
  app/                  # App Router entry (layout, homepage placeholder, globals)
  components/
    layout/             # Header, Footer, Announcement        (later tasks)
    home/               # Homepage section components          (later tasks)
    product/            # Shared ProductCard, ProductShowcase  (later tasks)
    ui/                 # Small shared UI primitives           (as needed)
  config/
    site.ts             # Brand, navigation, footer, social, contact (configurable)
    homepage.ts         # Locked homepage section order (controlled composition)
  data/                 # Mock/local content (products, categories, collections, …)
  lib/
    data.ts             # Async data-access seam: mock today, Laravel API later
    format.ts           # Small display helpers (money formatting)
  types/                # Commerce + homepage domain types
docs/                   # Governing master brief
public/images/          # Static assets (placeholder included)
```

## Architecture notes

- **Data seam:** components consume `@/lib/data` (async functions), never the
  raw `@/data/*` files. This lets the source switch from mock data to the future
  Laravel API without rewriting presentation components (brief §34).
- **Configuration over hardcoding:** client-specific content lives in
  `@/config` and `@/data`, keeping presentation reusable (brief §28).
- **Controlled composition, not a page builder:** the homepage is an ordered
  list of typed sections in `config/homepage.ts` — intentionally a small closed
  set, not a generic CMS (brief §35).
