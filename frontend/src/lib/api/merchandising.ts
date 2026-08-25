import type { Collection, Look, Occasion, Product, UGCContent } from "@/types/commerce";
import { apiRequest, unwrapData } from "./client";
import { ApiError } from "./errors";
import {
  mapAssociatedProducts,
  mapMerchCollection,
  mapMerchList,
  mapMerchLook,
  mapMerchOccasion,
  mapMerchUgc,
} from "../mappers/merchandising";

type ListResponse = { items?: unknown[] };
type DetailResponse = { item?: Record<string, unknown>; products?: unknown[] };

async function fetchList<T>(
  path: string,
  mapper: (raw: Record<string, unknown>) => T | null,
  query = "",
): Promise<T[]> {
  const suffix = query ? `?${query}` : "";
  const response = await apiRequest<{ data?: ListResponse }>(`/api/merchandising/${path}${suffix}`, {
    auth: false,
  });
  return mapMerchList(unwrapData(response)?.items, mapper);
}

export async function fetchPublicCollections(homeOnly = false): Promise<Collection[]> {
  return fetchList("collections", mapMerchCollection, homeOnly ? "home=true" : "");
}

async function fetchDetail(
  path: string,
): Promise<DetailResponse | null> {
  try {
    const response = await apiRequest<{ data?: DetailResponse }>(path, { auth: false });
    return unwrapData(response) ?? null;
  } catch (error) {
    if (error instanceof ApiError && error.kind === "not_found") return null;
    throw error;
  }
}

export async function fetchPublicCollectionBySlug(
  slug: string,
): Promise<{ collection: Collection; products: Product[] } | null> {
  const data = await fetchDetail(`/api/merchandising/collections/${encodeURIComponent(slug)}`);
  const collection = mapMerchCollection(data?.item ?? null);
  if (!collection) return null;
  return { collection, products: mapAssociatedProducts(data?.products) };
}

export async function fetchPublicOccasions(homeOnly = false): Promise<Occasion[]> {
  return fetchList("occasions", mapMerchOccasion, homeOnly ? "home=true" : "");
}

export async function fetchPublicOccasionBySlug(
  slug: string,
): Promise<{ occasion: Occasion; products: Product[] } | null> {
  const data = await fetchDetail(`/api/merchandising/occasions/${encodeURIComponent(slug)}`);
  const occasion = mapMerchOccasion(data?.item ?? null);
  if (!occasion) return null;
  return { occasion, products: mapAssociatedProducts(data?.products) };
}

export async function fetchPublicLooks(): Promise<Look[]> {
  return fetchList("looks", mapMerchLook);
}

export async function fetchPublicLookBySlug(
  slug: string,
): Promise<{ look: Look; products: Product[] } | null> {
  const data = await fetchDetail(`/api/merchandising/looks/${encodeURIComponent(slug)}`);
  const look = mapMerchLook(data?.item ?? null);
  if (!look) return null;
  return { look, products: mapAssociatedProducts(data?.products) };
}

export async function fetchPublicUgc(): Promise<UGCContent[]> {
  return fetchList("ugc", mapMerchUgc);
}
