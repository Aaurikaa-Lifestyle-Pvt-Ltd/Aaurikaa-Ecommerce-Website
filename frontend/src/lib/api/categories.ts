import type { Category, ProductImage } from "@/types/commerce";
import { apiRequest, unwrapData } from "./client";
import { ApiError } from "./errors";
import {
  mapBackendCategories,
  mapBackendCategory,
  type BackendCategory,
} from "../mappers/category";
import { mapMegaMenuTree, type MegaMenuTree } from "../mappers/mega-menu";
import { idString, resolveMediaUrl } from "../mappers/media";
import { buildTaxonomyHref } from "../taxonomy";

type Envelope<T> = { data?: T };

export type TaxonomyBreadcrumb = {
  label: string;
  href?: string;
};

export type TaxonomyNavItem = {
  id: string;
  slug: string;
  name: string;
  href: string;
  image?: ProductImage;
};

export type TaxonomySeo = {
  title: string;
  metaDescription: string;
  canonicalPath: string;
};

export type TaxonomyResolveResult = {
  depth: 1 | 2 | 3;
  category: Category;
  subcategory?: Category;
  childCategory?: Category;
  breadcrumbs: TaxonomyBreadcrumb[];
  seo: TaxonomySeo;
  navigation: {
    subcategories?: TaxonomyNavItem[];
    childCategories?: TaxonomyNavItem[];
  };
  /** Active depth node for PLP header. */
  active: Category;
};

type BackendNavNode = {
  _id?: unknown;
  id?: unknown;
  name?: string;
  slug?: string;
  image?: string;
};

type BackendResolvePayload = {
  depth?: number;
  category?: BackendCategory;
  subcategory?: BackendCategory;
  childCategory?: BackendCategory;
  breadcrumbs?: Array<{
    type?: string;
    name?: string;
    href?: string;
    slug?: string;
  }>;
  seo?: {
    title?: string;
    metaDescription?: string;
    canonicalPath?: string;
  };
  navigation?: {
    subcategories?: BackendNavNode[];
    childCategories?: BackendNavNode[];
  };
};

function mapNavItem(
  raw: BackendNavNode,
  href: string,
): TaxonomyNavItem | null {
  const id = idString(raw._id ?? raw.id);
  const slug = String(raw.slug ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!slug || !name) return null;
  return {
    id: id || slug,
    slug,
    name,
    href,
    image: raw.image ? { src: resolveMediaUrl(raw.image), alt: name } : undefined,
  };
}

function mapBreadcrumbs(
  raw: BackendResolvePayload["breadcrumbs"],
): TaxonomyBreadcrumb[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      { label: "Home", href: "/" },
      { label: "Categories", href: "/categories" },
    ];
  }
  return raw.map((item, index) => {
    const isLast = index === raw.length - 1;
    let label = String(item.name ?? "").trim() || "…";
    if (item.type === "shop" || label.toLowerCase() === "shop") {
      label = "Categories";
    }
    const href = item.href && !isLast ? item.href : undefined;
    return { label, href };
  });
}

export async function fetchPublicCategories(): Promise<Category[]> {
  const response = await apiRequest<Envelope<unknown> | unknown[]>("/api/categories", {
    auth: false,
  });
  const data = Array.isArray(response) ? response : unwrapData(response as Envelope<unknown>);
  return mapBackendCategories(data);
}

export async function fetchPublicCategoryBySlug(slug: string): Promise<Category | null> {
  const categories = await fetchPublicCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}

/** @deprecated Prefer resolveTaxonomy for hierarchy-aware PLP. */
export async function resolveTaxonomyCategory(slug: string): Promise<Category | null> {
  const resolved = await resolveTaxonomy({ categorySlug: slug });
  return resolved?.category ?? null;
}

/**
 * Resolve category → subcategory → child path with nav, SEO, and breadcrumbs.
 * Returns null on 404 / unresolved hierarchy.
 */
export async function resolveTaxonomy(params: {
  categorySlug: string;
  subSlug?: string;
  childSlug?: string;
}): Promise<TaxonomyResolveResult | null> {
  const search = new URLSearchParams({
    categorySlug: params.categorySlug,
  });
  if (params.subSlug) search.set("subSlug", params.subSlug);
  if (params.childSlug) search.set("childSlug", params.childSlug);

  let response: Envelope<BackendResolvePayload>;
  try {
    response = await apiRequest<Envelope<BackendResolvePayload>>(
      `/api/taxonomy/resolve?${search.toString()}`,
      { auth: false },
    );
  } catch (err) {
    if (err instanceof ApiError && err.kind === "not_found") return null;
    throw err;
  }

  const data = unwrapData(response);
  if (!data?.category) return null;

  const depth = (data.depth === 2 || data.depth === 3 ? data.depth : 1) as 1 | 2 | 3;
  const category = mapBackendCategory(data.category);
  if (!category) return null;

  const subcategory = data.subcategory
    ? mapBackendCategory(data.subcategory, {
        categorySlug: category.slug,
        subSlug: String(data.subcategory.slug ?? "").trim(),
      })
    : undefined;

  const childCategory = data.childCategory
    ? mapBackendCategory(data.childCategory, {
        categorySlug: category.slug,
        subSlug: subcategory?.slug,
        childSlug: String(data.childCategory.slug ?? "").trim(),
      })
    : undefined;

  const active =
    depth === 3 && childCategory
      ? childCategory
      : depth === 2 && subcategory
        ? subcategory
        : category;

  const subcategories = (data.navigation?.subcategories ?? [])
    .map((node) =>
      mapNavItem(
        node,
        buildTaxonomyHref(category.slug, String(node.slug ?? "").trim()),
      ),
    )
    .filter((n): n is TaxonomyNavItem => Boolean(n));

  const childCategories = (data.navigation?.childCategories ?? [])
    .map((node) =>
      mapNavItem(
        node,
        buildTaxonomyHref(
          category.slug,
          subcategory?.slug,
          String(node.slug ?? "").trim(),
        ),
      ),
    )
    .filter((n): n is TaxonomyNavItem => Boolean(n));

  const seoTitle = String(data.seo?.title ?? "").trim();
  const seoDescription = String(data.seo?.metaDescription ?? "").trim();
  const canonicalPath =
    String(data.seo?.canonicalPath ?? "").trim() ||
    buildTaxonomyHref(category.slug, subcategory?.slug, childCategory?.slug);

  return {
    depth,
    category,
    subcategory: subcategory ?? undefined,
    childCategory: childCategory ?? undefined,
    breadcrumbs: mapBreadcrumbs(data.breadcrumbs),
    seo: {
      title: seoTitle || active.title || active.name,
      metaDescription:
        seoDescription ||
        (active.description
          ? active.description.slice(0, 160)
          : `Shop ${active.name}.`),
      canonicalPath,
    },
    navigation: {
      subcategories: subcategories.length > 0 ? subcategories : undefined,
      childCategories: childCategories.length > 0 ? childCategories : undefined,
    },
    active,
  };
}

/** Mega-menu tree for dependent search facets (and optional header nav). */
export async function fetchMegaMenuTree(): Promise<MegaMenuTree> {
  const response = await apiRequest<Envelope<unknown>>(
    "/api/categories/mega-menu",
    { auth: false },
  );
  const data = unwrapData(response);
  return mapMegaMenuTree(data);
}
