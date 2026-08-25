import type { Collection, Look, Occasion, Product, UGCContent } from "@/types/commerce";
import { mapBackendProduct } from "./product";
import { idString, resolveMediaUrl } from "./media";

const PLACEHOLDER = "/images/placeholder.svg";

type RawMerch = Record<string, unknown>;

function imageFrom(url: unknown, alt: unknown, fallbackAlt: string) {
  return {
    src: resolveMediaUrl(url) || PLACEHOLDER,
    alt: String(alt || fallbackAlt).trim() || fallbackAlt,
  };
}

export function mapMerchCollection(raw: RawMerch | null | undefined): Collection | null {
  if (!raw) return null;
  const id = idString(raw._id ?? raw.id);
  const slug = String(raw.slug ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!id || !slug || !name) return null;
  return {
    id,
    slug,
    name,
    description: String(raw.description ?? "").trim() || undefined,
    image: imageFrom(raw.imageUrl, raw.imageAlt, name),
    href: `/collections/${slug}`,
    editorial: Boolean(raw.showOnHome),
    seoTitle: String(raw.seoTitle ?? "").trim() || undefined,
    seoDescription: String(raw.seoDescription ?? "").trim() || undefined,
  };
}

export function mapMerchOccasion(raw: RawMerch | null | undefined): Occasion | null {
  if (!raw) return null;
  const id = idString(raw._id ?? raw.id);
  const slug = String(raw.slug ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!id || !slug || !name) return null;
  return {
    id,
    slug,
    name,
    description: String(raw.description ?? "").trim() || undefined,
    image: imageFrom(raw.imageUrl, raw.imageAlt, name),
    href: `/occasions/${slug}`,
    seoTitle: String(raw.seoTitle ?? "").trim() || undefined,
    seoDescription: String(raw.seoDescription ?? "").trim() || undefined,
  };
}

export function mapMerchLook(raw: RawMerch | null | undefined): Look | null {
  if (!raw) return null;
  const id = idString(raw._id ?? raw.id);
  const slug = String(raw.slug ?? "").trim();
  const title = String(raw.title ?? "").trim();
  if (!id || !title) return null;
  const href =
    String(raw.ctaHref ?? "").trim() || (slug ? `/looks/${slug}` : "");
  if (!href) return null;
  const image = imageFrom(raw.imageUrl, raw.imageAlt, title);
  const mobileUrl = String(raw.mobileImageUrl ?? "").trim();
  return {
    id,
    slug: slug || undefined,
    title,
    description: String(raw.description ?? "").trim() || undefined,
    image,
    mobileImage: mobileUrl
      ? imageFrom(raw.mobileImageUrl, raw.mobileImageAlt, title)
      : image,
    ctaLabel: String(raw.ctaLabel ?? "").trim() || "Shop the Look",
    href,
    productIds: Array.isArray(raw.productIds)
      ? raw.productIds.map((value) => idString(value)).filter(Boolean)
      : undefined,
  };
}

export function mapMerchUgc(raw: RawMerch | null | undefined): UGCContent | null {
  if (!raw) return null;
  const id = idString(raw._id ?? raw.id);
  if (!id) return null;
  const productIds = Array.isArray(raw.productIds)
    ? raw.productIds.map((value) => idString(value)).filter(Boolean)
    : [];
  const external = String(raw.externalUrl ?? "").trim();
  const firstProductSlug = String(raw.productSlug ?? "").trim();
  const href = firstProductSlug
    ? `/products/${firstProductSlug}`
    : external || undefined;
  return {
    id,
    image: imageFrom(raw.imageUrl, raw.imageAlt, String(raw.caption ?? "Styled by You")),
    videoUrl: String(raw.videoUrl ?? "").trim() || undefined,
    creator: String(raw.creatorName ?? "").trim() || undefined,
    caption: String(raw.caption ?? "").trim() || undefined,
    productIds: productIds.length ? productIds : undefined,
    href,
  };
}

export function mapMerchList<T>(
  raw: unknown,
  mapper: (item: RawMerch) => T | null,
): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => mapper(item as RawMerch)).filter((item): item is T => Boolean(item));
}

export function mapAssociatedProducts(raw: unknown): Product[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => mapBackendProduct(item as Parameters<typeof mapBackendProduct>[0]))
    .filter((item): item is Product => Boolean(item));
}
