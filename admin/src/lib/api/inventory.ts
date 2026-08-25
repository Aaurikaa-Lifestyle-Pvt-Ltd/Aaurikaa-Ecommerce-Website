import { ApiError } from "./errors";
import { apiRequest, unwrapData } from "./client";
import { fetchAdminProductsPage } from "./products";

export type AdminInventoryRow = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  status: string;
};

export type AdminInventoryQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  stock?: "all" | "in_stock" | "low" | "out";
};

export type AdminInventoryResult = {
  items: AdminInventoryRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
  /** True when response came from products list fallback (dedicated inventory API unavailable). */
  usedProductsFallback: boolean;
};

function mapInventoryRow(raw: Record<string, unknown>): AdminInventoryRow | null {
  const id = String(raw._id ?? raw.id ?? "").trim();
  if (!id) return null;
  const effective =
    raw.stockEffective !== undefined && raw.stockEffective !== null
      ? Number(raw.stockEffective)
      : Number(raw.stock ?? raw.availableStock ?? 0);
  return {
    id,
    name: String(raw.name ?? "").trim() || "Untitled",
    sku: String(raw.sku ?? "").trim(),
    stock: Number.isFinite(effective) ? effective : 0,
    status: String(raw.status ?? "").trim() || "—",
  };
}

function filterByStock(
  items: AdminInventoryRow[],
  stock: AdminInventoryQuery["stock"],
): AdminInventoryRow[] {
  if (!stock || stock === "all") return items;
  if (stock === "out") return items.filter((row) => row.stock <= 0);
  if (stock === "low") return items.filter((row) => row.stock > 0 && row.stock <= 5);
  return items.filter((row) => row.stock > 0);
}

/**
 * GET /api/admin/inventory
 * Query: search|q, status, stock (all|in_stock|low|out), page, limit
 * Prefers stockEffective for displayed stock when present.
 */
async function fetchFromDedicatedInventory(
  query: AdminInventoryQuery,
): Promise<AdminInventoryResult | null> {
  const params = new URLSearchParams();
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  params.set("page", String(page));
  params.set("limit", String(limit));

  if (query.search?.trim()) {
    const term = query.search.trim();
    params.set("search", term);
    params.set("q", term);
  }
  if (query.status && query.status !== "all") {
    params.set("status", query.status);
  }
  if (query.stock && query.stock !== "all") {
    params.set("stock", query.stock);
  }

  try {
    const response = await apiRequest<unknown>(
      `/api/admin/inventory?${params.toString()}`,
    );
    const data = unwrapData(response as { data?: unknown }) ?? response;
    const payload = data as {
      items?: unknown[];
      products?: unknown[];
      count?: number;
      pagination?: {
        page?: number;
        limit?: number;
        total?: number;
        pages?: number;
      };
    };
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.items)
        ? payload.items
        : Array.isArray(payload.products)
          ? payload.products
          : null;
    if (!list) return null;

    const items = list
      .map((item) => mapInventoryRow(item as Record<string, unknown>))
      .filter((item): item is AdminInventoryRow => Boolean(item));

    const pagination = payload.pagination;
    if (
      pagination &&
      typeof pagination.page === "number" &&
      typeof pagination.limit === "number" &&
      typeof pagination.total === "number"
    ) {
      return {
        items,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total: pagination.total,
          pages:
            typeof pagination.pages === "number"
              ? pagination.pages
              : Math.max(1, Math.ceil(pagination.total / pagination.limit) || 1),
        },
        usedProductsFallback: false,
      };
    }

    // Legacy response without pagination — treat list as full result for this page.
    const total =
      typeof payload.count === "number" && payload.count >= items.length
        ? payload.count
        : items.length;
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit) || 1),
      },
      usedProductsFallback: false,
    };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
      return null;
    }
    throw err;
  }
}

async function fetchFromProductsFallback(
  query: AdminInventoryQuery,
): Promise<AdminInventoryResult> {
  const result = await fetchAdminProductsPage({
    page: query.page ?? 1,
    limit: query.limit ?? 25,
    search: query.search,
    status: query.status && query.status !== "all" ? query.status : undefined,
    tab: "all",
    sortBy: "stock",
    sortOrder: "asc",
  });
  let items: AdminInventoryRow[] = result.products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    stock: p.stock,
    status: p.status,
  }));
  items = filterByStock(items, query.stock);
  return {
    items,
    pagination: result.pagination,
    usedProductsFallback: true,
  };
}

/**
 * Prefers GET /api/admin/inventory when available; otherwise builds from admin products.
 */
export async function fetchAdminInventory(
  query: AdminInventoryQuery = {},
): Promise<AdminInventoryResult> {
  const dedicated = await fetchFromDedicatedInventory(query);
  if (dedicated) return dedicated;
  return fetchFromProductsFallback(query);
}
