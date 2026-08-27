/**
 * Data-access layer (brief §34).
 *
 * Presentation code must import from here — never directly from `@/data/*`.
 *
 * Catalogue merchandising (hero, editorial collections, occasions, looks, UGC)
 * uses the merchandising API when NEXT_PUBLIC_CATALOGUE_SOURCE=api. Empty API
 * results stay empty — they do not fall back to demo jewellery edits.
 *
 * When NEXT_PUBLIC_CATALOGUE_SOURCE=api, product/category/search reads use the
 * configured backend. Failures surface to the page — they do not fall back to
 * fabricated jewellery products.
 */
import { brandStory } from "@/data/brand";
import { campaignBanners } from "@/data/campaign-banners";
import { categories as mockCategories } from "@/data/categories";
import { collections } from "@/data/collections";
import { looks } from "@/data/looks";
import { newsletter } from "@/data/newsletter";
import { occasions } from "@/data/occasions";
import { products as mockProducts } from "@/data/products";
import { trustItems } from "@/data/trust";
import { ugcContent } from "@/data/ugc";
import { isApiCatalogue } from "@/lib/api/config";
import {
  fetchProductsPriceBounds,
  fetchPublicProductBySlug,
  fetchPublicProducts,
  fetchRelatedProducts,
  fetchTaxonomyPriceBounds,
  fetchTaxonomyProducts,
  searchPublicProducts,
} from "@/lib/api/products";
import {
  fetchMegaMenuTree,
  fetchPublicCategories,
  fetchPublicCategoryBySlug,
  resolveTaxonomy,
  resolveTaxonomyCategory,
  type TaxonomyResolveResult,
} from "@/lib/api/categories";
import {
  fetchPublicCollectionBySlug,
  fetchPublicCollections,
  fetchPublicLookBySlug,
  fetchPublicLooks,
  fetchPublicOccasionBySlug,
  fetchPublicOccasions,
  fetchPublicUgc,
} from "@/lib/api/merchandising";
import {
  fetchSlidesForPlacement,
} from "@/lib/api/sliders";
import type { BannerPlacement, HomepageSlide } from "@/lib/mappers/slider";
import {
  applyDiscoveryPage,
  defaultDiscoveryQuery,
  toBackendListQuery,
  type ProductListPage,
} from "@/lib/discovery";
import {
  fetchProductsForLabelSlug,
  isLabelCollectionSlug,
  labelSlugPriceBoundsQuery,
  mergeLabelCollections,
  virtualLabelCollection,
} from "@/lib/label-collections";
import {
  resolveTaxonomyFilterIds,
  type MegaMenuTree,
} from "@/lib/mappers/mega-menu";
import {
  buildTaxonomyHref,
  parseTaxonomyPath,
  type TaxonomyPath,
} from "@/lib/taxonomy";
import type { PriceBounds } from "@/types/discovery";
import type {
  BrandContent,
  CampaignBannerContent,
  CampaignBannerVariant,
  Category,
  Collection,
  HeroContent,
  Look,
  NewsletterContent,
  Occasion,
  Product,
  TrustItem,
  UGCContent,
} from "@/types/commerce";
import type { DiscoveryQuery } from "@/types/discovery";

export async function getHomepageSlides(
  placement: BannerPlacement,
): Promise<HomepageSlide[]> {
  if (isApiCatalogue()) {
    try {
      return await fetchSlidesForPlacement(placement);
    } catch {
      return [];
    }
  }
  // Demo mode: no invented slider content for the multi-section API architecture.
  return [];
}

/** @deprecated Prefer getHomepageSlides("hero"). */
export async function getHero(): Promise<HeroContent | null> {
  const slides = await getHomepageSlides("hero");
  const first = slides[0];
  if (!first) return null;
  return {
    heading: first.heading,
    supportingText: first.caption,
    image: first.image,
    mobileImage: first.mobileImage,
    primaryCta: first.cta,
    align: "left",
    overlay: "dark",
  };
}

export async function getCampaignBanner(
  variant: CampaignBannerVariant,
): Promise<CampaignBannerContent | undefined> {
  // Campaign mid-page banners no longer consume Slider records.
  if (isApiCatalogue()) {
    return undefined;
  }
  return campaignBanners.find((banner) => banner.variant === variant);
}

export async function getCampaignBanners(): Promise<CampaignBannerContent[]> {
  if (isApiCatalogue()) {
    return [];
  }
  return campaignBanners;
}

export async function getCategories(): Promise<Category[]> {
  if (isApiCatalogue()) {
    return fetchPublicCategories();
  }
  return mockCategories;
}

export async function getCategoryBySlug(
  slug: string,
): Promise<Category | undefined> {
  if (isApiCatalogue()) {
    try {
      const resolved = await resolveTaxonomyCategory(slug);
      if (resolved) return resolved;
    } catch {
      // Fall through to the public category list; still no mock fallback.
    }
    const listed = await fetchPublicCategoryBySlug(slug);
    return listed ?? undefined;
  }
  return mockCategories.find((c) => c.slug === slug);
}

/**
 * Resolve a catch-all `/categories/[...path]` into hierarchy + nav + SEO.
 * Mock mode supports flat categories only (sub/child unresolved → null).
 */
export async function getTaxonomyPath(
  segments: string[],
): Promise<TaxonomyResolveResult | null> {
  const path = parseTaxonomyPath(segments);
  if (!path) return null;

  if (isApiCatalogue()) {
    try {
      return await resolveTaxonomy({
        categorySlug: path.categorySlug,
        subSlug: path.subSlug,
        childSlug: path.childSlug,
      });
    } catch {
      return null;
    }
  }

  // Mock: only depth-1 flat categories exist.
  if (path.depth > 1) return null;
  const category = mockCategories.find((c) => c.slug === path.categorySlug);
  if (!category) return null;
  return {
    depth: 1,
    category,
    breadcrumbs: [
      { label: "Home", href: "/" },
      { label: "Categories", href: "/categories" },
      { label: category.name },
    ],
    seo: {
      title: category.name,
      metaDescription: `Shop ${category.name}.`,
      canonicalPath: buildTaxonomyHref(category.slug),
    },
    navigation: {},
    active: category,
  };
}

/** Products belonging to a category slug (paginated discovery). */
export async function getProductsByCategory(
  slug: string,
  query: DiscoveryQuery = defaultDiscoveryQuery(),
): Promise<ProductListPage> {
  return getProductsByTaxonomyPath(
    { categorySlug: slug, depth: 1 },
    query,
  );
}

/** Products at a taxonomy path (paginated; backend authoritative in API mode). */
export async function getProductsByTaxonomyPath(
  path: TaxonomyPath,
  query: DiscoveryQuery = defaultDiscoveryQuery(),
): Promise<ProductListPage> {
  if (isApiCatalogue()) {
    return fetchTaxonomyProducts(
      {
        categorySlug: path.categorySlug,
        subSlug: path.subSlug,
        childSlug: path.childSlug,
      },
      toBackendListQuery(query),
    );
  }
  if (path.depth > 1) {
    return {
      products: [],
      totalCount: 0,
      totalPages: 1,
      currentPage: 1,
    };
  }
  return applyDiscoveryPage(
    mockProducts.filter((p) => p.categoryIds?.includes(path.categorySlug)),
    query,
  );
}

/** Price bounds for a taxonomy PLP (nulls when empty / mock without prices). */
export async function getTaxonomyPriceBounds(
  path: TaxonomyPath,
): Promise<PriceBounds> {
  if (isApiCatalogue()) {
    try {
      return await fetchTaxonomyPriceBounds({
        categorySlug: path.categorySlug,
        subSlug: path.subSlug,
        childSlug: path.childSlug,
      });
    } catch {
      return { minPrice: null, maxPrice: null };
    }
  }
  const scoped = mockProducts.filter((p) =>
    p.categoryIds?.includes(path.categorySlug),
  );
  if (scoped.length === 0) return { minPrice: null, maxPrice: null };
  const amounts = scoped.map((p) => p.price.amount);
  return {
    minPrice: Math.min(...amounts),
    maxPrice: Math.max(...amounts),
  };
}

/** Mega-menu tree for search facets (empty in mock / on failure). */
export async function getMegaMenuTree(): Promise<MegaMenuTree> {
  if (!isApiCatalogue()) return [];
  try {
    return await fetchMegaMenuTree();
  } catch {
    return [];
  }
}

/** Price bounds for search / global product listing filters. */
export async function getSearchPriceBounds(
  query: DiscoveryQuery,
  tree: MegaMenuTree = [],
): Promise<PriceBounds> {
  if (isApiCatalogue()) {
    try {
      const ids = resolveTaxonomyFilterIds(tree, {
        category: query.category,
        subcategory: query.subcategory,
        child: query.child,
      });
      return await fetchProductsPriceBounds(
        toBackendListQuery(query, ids),
      );
    } catch {
      return { minPrice: null, maxPrice: null };
    }
  }
  if (mockProducts.length === 0) return { minPrice: null, maxPrice: null };
  const amounts = mockProducts.map((p) => p.price.amount);
  return {
    minPrice: Math.min(...amounts),
    maxPrice: Math.max(...amounts),
  };
}

export async function getCollections(): Promise<Collection[]> {
  if (isApiCatalogue()) {
    const apiCollections = await fetchPublicCollections();
    return mergeLabelCollections(apiCollections);
  }
  return collections;
}

/**
 * Editorial/"story" collections for Collection Stories (brief §17).
 * Order is curated so the first stories diverge from the seasonal campaign
 * that precedes this section, keeping aesthetic entry points distinct.
 */
export async function getStoryCollections(): Promise<Collection[]> {
  if (isApiCatalogue()) {
    return fetchPublicCollections(true);
  }
  const storyOrder = [
    "the-pearl-edit",
    "statement-jewellery",
    "the-festive-edit",
    "everyday-gold",
  ];
  const bySlug = new Map(
    collections.filter((c) => c.editorial).map((c) => [c.slug, c]),
  );
  return storyOrder
    .map((slug) => bySlug.get(slug))
    .filter((c): c is Collection => Boolean(c));
}

export async function getCollectionBySlug(
  slug: string,
): Promise<Collection | undefined> {
  if (isApiCatalogue()) {
    const result = await fetchPublicCollectionBySlug(slug);
    if (result?.collection) return result.collection;
    if (isLabelCollectionSlug(slug)) {
      return virtualLabelCollection(slug);
    }
    return undefined;
  }
  return collections.find((c) => c.slug === slug);
}

export async function getProducts(): Promise<Product[]> {
  if (isApiCatalogue()) {
    const page = await fetchPublicProducts({ limit: 24, sortBy: "newest" });
    return page.products;
  }
  return mockProducts;
}

export async function getProductBySlug(
  slug: string,
): Promise<Product | undefined> {
  if (isApiCatalogue()) {
    const product = await fetchPublicProductBySlug(slug);
    return product ?? undefined;
  }
  return mockProducts.find((p) => p.slug === slug);
}

/**
 * Related products for the PDP — backend related endpoint when catalogue is
 * live; same-category mock relationship otherwise.
 */
export async function getRelatedProducts(
  product: Product,
  limit = 4,
): Promise<Product[]> {
  if (isApiCatalogue()) {
    const related = await fetchRelatedProducts(product.id);
    return related.slice(0, limit);
  }
  const category = product.categoryIds?.[0];
  if (!category) {
    return mockProducts.filter((p) => p.id !== product.id).slice(0, limit);
  }
  const related = mockProducts.filter(
    (p) => p.id !== product.id && p.categoryIds?.includes(category),
  );
  if (related.length >= limit) return related.slice(0, limit);
  const fillers = mockProducts.filter(
    (p) => p.id !== product.id && !related.some((r) => r.id === p.id),
  );
  return [...related, ...fillers].slice(0, limit);
}

/** Price bounds for a collection PLP (label destinations + curated sets). */
export async function getCollectionPriceBounds(
  slug: string,
  query: DiscoveryQuery = defaultDiscoveryQuery(),
): Promise<PriceBounds> {
  if (isApiCatalogue()) {
    try {
      if (isLabelCollectionSlug(slug)) {
        return await fetchProductsPriceBounds(
          labelSlugPriceBoundsQuery(slug, toBackendListQuery(query)),
        );
      }
      const result = await fetchPublicCollectionBySlug(slug);
      const amounts = (result?.products ?? [])
        .map((p) => p.price?.amount)
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
      if (amounts.length === 0) return { minPrice: null, maxPrice: null };
      return {
        minPrice: Math.min(...amounts),
        maxPrice: Math.max(...amounts),
      };
    } catch {
      return { minPrice: null, maxPrice: null };
    }
  }
  const scoped = mockProducts.filter((p) => p.collectionIds?.includes(slug));
  if (scoped.length === 0) return { minPrice: null, maxPrice: null };
  const amounts = scoped.map((p) => p.price.amount);
  return {
    minPrice: Math.min(...amounts),
    maxPrice: Math.max(...amounts),
  };
}

/** Price bounds for an occasion PLP (from associated products). */
export async function getOccasionPriceBounds(
  slug: string,
): Promise<PriceBounds> {
  const products = await getProductsByOccasion(slug);
  if (products.length === 0) return { minPrice: null, maxPrice: null };
  const amounts = products
    .map((p) => p.price?.amount)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (amounts.length === 0) return { minPrice: null, maxPrice: null };
  return {
    minPrice: Math.min(...amounts),
    maxPrice: Math.max(...amounts),
  };
}

/**
 * Products merchandised under a collection slug (e.g. "new-arrivals").
 * Label destinations and search-backed lists delegate page/filter/sort to
 * `/api/products`. Curated merchandising collections already return the full
 * associated set — discovery is applied then paginated locally (no 24-cap).
 */
export async function getProductsByCollection(
  slug: string,
  query: DiscoveryQuery = defaultDiscoveryQuery(),
): Promise<ProductListPage> {
  if (isApiCatalogue()) {
    const result = await fetchPublicCollectionBySlug(slug);
    if (result?.products?.length) {
      return applyDiscoveryPage(result.products, query);
    }
    if (isLabelCollectionSlug(slug)) {
      const backendQuery = toBackendListQuery(query);
      // Featured is the discovery default — omit sortBy so label destinations
      // keep their operational defaults (sales / newest).
      if (query.sort === "featured") {
        const { sortBy: _ignored, ...withoutSort } = backendQuery;
        return fetchProductsForLabelSlug(
          slug,
          fetchPublicProducts,
          withoutSort,
        );
      }
      return fetchProductsForLabelSlug(
        slug,
        fetchPublicProducts,
        backendQuery,
      );
    }
    return {
      products: [],
      totalCount: 0,
      totalPages: 1,
      currentPage: 1,
    };
  }
  return applyDiscoveryPage(
    mockProducts.filter((p) => p.collectionIds?.includes(slug)),
    query,
  );
}

export async function getProductsByOccasion(slug: string): Promise<Product[]> {
  if (isApiCatalogue()) {
    const result = await fetchPublicOccasionBySlug(slug);
    return result?.products ?? [];
  }
  return [];
}

/**
 * Free-text product search with shared discovery filters/sort/pagination.
 * API mode delegates to `GET /api/products` (existing search engine).
 * Pass `megaMenu` so category/sub/child slug facets map to ObjectIds.
 */
export async function searchProducts(
  query: DiscoveryQuery = defaultDiscoveryQuery(),
  megaMenu: MegaMenuTree = [],
): Promise<ProductListPage> {
  if (isApiCatalogue()) {
    const ids = resolveTaxonomyFilterIds(megaMenu, {
      category: query.category,
      subcategory: query.subcategory,
      child: query.child,
    });
    return searchPublicProducts(toBackendListQuery(query, ids));
  }
  const needle = query.q?.trim() ?? "";
  const scoped = !needle
    ? mockProducts
    : mockProducts.filter((p) => {
        const haystack = [p.name, p.shortDescription ?? ""]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle.toLowerCase());
      });
  return applyDiscoveryPage(scoped, { ...query, q: undefined });
}

export async function getOccasions(): Promise<Occasion[]> {
  if (isApiCatalogue()) {
    return fetchPublicOccasions(true);
  }
  return occasions;
}

export async function getOccasionIndex(): Promise<Occasion[]> {
  if (isApiCatalogue()) {
    return fetchPublicOccasions();
  }
  return occasions;
}

export async function getOccasionBySlug(
  slug: string,
): Promise<Occasion | undefined> {
  if (isApiCatalogue()) {
    const result = await fetchPublicOccasionBySlug(slug);
    return result?.occasion;
  }
  return occasions.find((item) => item.slug === slug);
}

export async function getLooks(): Promise<Look[]> {
  if (isApiCatalogue()) {
    return fetchPublicLooks();
  }
  return looks;
}

export async function getLookBySlug(
  slug: string,
): Promise<{ look: Look; products: Product[] } | undefined> {
  if (isApiCatalogue()) {
    const result = await fetchPublicLookBySlug(slug);
    return result ?? undefined;
  }
  const look = looks.find((item) => item.id === slug || item.slug === slug);
  if (!look) return undefined;
  const products = mockProducts.filter((product) => look.productIds?.includes(product.id));
  return { look, products };
}

export async function getUGCContent(): Promise<UGCContent[]> {
  if (isApiCatalogue()) {
    return fetchPublicUgc();
  }
  return ugcContent;
}

/**
 * Brand story — API mode has no CMS yet (CONFIGURE / CLIENT INPUT).
 * Returns null so the section hides; mock mode keeps demo content.
 */
export async function getBrandStory(): Promise<BrandContent | null> {
  if (isApiCatalogue()) return null;
  return brandStory;
}

/**
 * Trust strip — API mode has no CMS yet. Empty list hides the section.
 */
export async function getTrustItems(): Promise<TrustItem[]> {
  if (isApiCatalogue()) return [];
  return trustItems;
}

/**
 * Newsletter — API mode has no CMS yet. Null hides the section
 * (NewsletterSection must not fall through to demo defaults).
 */
export async function getNewsletter(): Promise<NewsletterContent | null> {
  if (isApiCatalogue()) return null;
  return newsletter;
}
