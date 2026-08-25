import type { Category, ProductImage } from "@/types/commerce";
import { idString, resolveMediaUrl } from "./media";
import { buildTaxonomyHref } from "../taxonomy";

export type BackendCategory = {
  _id?: unknown;
  id?: unknown;
  name?: string;
  slug?: string;
  title?: string;
  description?: string | unknown;
  image?: string;
  isActive?: boolean;
};

function plainDescription(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed || undefined;
  }
  return undefined;
}

function mapImage(src: string | undefined, alt: string): ProductImage {
  return { src: resolveMediaUrl(src), alt };
}

export function mapBackendCategory(
  raw: BackendCategory | null | undefined,
  hrefOverrides?: { categorySlug?: string; subSlug?: string; childSlug?: string },
): Category | null {
  if (!raw) return null;
  // Defense-in-depth: storefront must not surface inactive root categories.
  if (raw.isActive === false) return null;
  const id = idString(raw._id ?? raw.id);
  const slug = String(raw.slug ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!id || !slug || !name) return null;

  const categorySlug = hrefOverrides?.categorySlug ?? slug;
  const href = buildTaxonomyHref(
    categorySlug,
    hrefOverrides?.subSlug,
    hrefOverrides?.childSlug,
  );

  const title = String(raw.title ?? "").trim() || undefined;
  const description = plainDescription(raw.description);

  return {
    id,
    slug,
    name,
    title,
    description,
    image: mapImage(raw.image, name),
    href,
  };
}

export function mapBackendCategories(raw: unknown): Category[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => mapBackendCategory(item as BackendCategory))
    .filter((item): item is Category => Boolean(item));
}

export {
  mapMegaMenuTree,
  resolveTaxonomyFilterIds,
  type MegaMenuChild,
  type MegaMenuSubcategory,
  type MegaMenuCategory,
  type MegaMenuTree,
} from "./mega-menu";
