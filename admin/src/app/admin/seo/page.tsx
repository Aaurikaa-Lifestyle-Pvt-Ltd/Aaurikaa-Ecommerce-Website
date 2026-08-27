"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { fetchAdminCategories, updateAdminCategory } from "@/lib/api/categories";
import { fetchStaticPageRegistry } from "@/lib/api/cms";
import {
  fetchAdminMerch,
  updateAdminMerch,
  type AdminMerchItem,
} from "@/lib/api/merchandising";
import {
  fetchAdminProduct,
  fetchAdminProductsPage,
  updateAdminProduct,
} from "@/lib/api/products";
import { fetchSeoSettings, updateSeoSettings, type SeoPayload } from "@/lib/api/settings";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api/errors";
import { toBackendProductStatus } from "@/lib/mappers/product";
import { useAdminResource } from "@/lib/use-admin-resource";
import type { AdminCategory, AdminProduct } from "@/types/admin";

const TABS = [
  { id: "global", label: "Global" },
  { id: "products", label: "Products" },
  { id: "categories", label: "Categories" },
  { id: "collections", label: "Collections" },
  { id: "occasions", label: "Occasions" },
  { id: "cms", label: "Pages" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SeoPage() {
  const [tab, setTab] = useState<TabId>("global");

  return (
    <div>
      <PageHeader
        title="SEO"
        description="Search listings across global site settings, products, categories, collections, occasions, and pages. Uses existing APIs — not a separate SEO engine."
      />

      <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "inline-flex h-10 items-center rounded-[var(--radius-sm)] px-3 text-sm font-medium touch-manipulation",
              tab === item.id
                ? "bg-foreground text-background"
                : "border border-border bg-surface hover:bg-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "global" ? <GlobalSeoTab /> : null}
      {tab === "products" ? <ProductsSeoTab /> : null}
      {tab === "categories" ? <CategoriesSeoTab /> : null}
      {tab === "collections" ? <MerchSeoTab kind="collections" /> : null}
      {tab === "occasions" ? <MerchSeoTab kind="occasions" /> : null}
      {tab === "cms" ? <CmsSeoTab /> : null}
    </div>
  );
}

function GlobalSeoTab() {
  const seoQuery = useAdminResource(() => fetchSeoSettings(), []);

  if (seoQuery.loading) {
    return (
      <Card>
        <LoadingState message="Loading SEO…" />
      </Card>
    );
  }
  if (seoQuery.error) {
    return (
      <Card>
        <ErrorState message={seoQuery.error} onRetry={() => void seoQuery.reload()} />
      </Card>
    );
  }
  return <GlobalSeoForm initial={seoQuery.data ?? {}} />;
}

function GlobalSeoForm({ initial }: { initial: SeoPayload }) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [keywords, setKeywords] = useState(initial.keywords ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateSeoSettings({ title, description, keywords });
      toast.success("SEO settings saved");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Unable to save SEO settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader title="Homepage / global meta" description="GET/PUT /api/settings/seo" />
        <div className="grid gap-4 p-4 sm:p-5">
          <Field label="Meta title" htmlFor="metaTitle">
            <Input id="metaTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Meta description" htmlFor="metaDescription">
            <Textarea
              id="metaDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </Field>
          <Field label="Keywords" htmlFor="keywords">
            <Input
              id="keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </Field>
          {saveError ? (
            <p className="text-sm text-danger" role="alert">
              {saveError}
            </p>
          ) : null}
          <Button className="w-full sm:w-auto" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save global SEO"}
          </Button>
        </div>
      </Card>
    </>
  );
}

function ProductsSeoTab() {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useAdminResource(
    () =>
      fetchAdminProductsPage({
        page: 1,
        limit: 20,
        search: applied.trim().length >= 2 ? applied.trim() : undefined,
        tab: "all",
        sortBy: "name",
        sortOrder: "asc",
      }),
    [applied],
  );
  const productQuery = useAdminResource(
    () => (selectedId ? fetchAdminProduct(selectedId) : Promise.resolve(null)),
    [selectedId],
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <Field label="Search products" htmlFor="seo-product-search" className="min-w-[14rem] flex-1">
            <Input
              id="seo-product-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name (min 2 characters)"
            />
          </Field>
          <div className="flex items-end">
            <Button type="button" onClick={() => setApplied(search)}>
              Search
            </Button>
          </div>
        </div>
      </Card>

      {listQuery.loading ? (
        <Card>
          <LoadingState message="Loading products…" />
        </Card>
      ) : listQuery.error ? (
        <Card>
          <ErrorState message={listQuery.error} onRetry={() => void listQuery.reload()} />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border max-h-64 overflow-auto">
            {(listQuery.data?.products ?? []).map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  className={cn(
                    "w-full px-4 py-3 text-left text-sm hover:bg-muted",
                    selectedId === product.id && "bg-muted",
                  )}
                  onClick={() => setSelectedId(product.id)}
                >
                  <span className="font-medium">{product.name}</span>
                  {product.sku ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      SKU {product.sku}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {selectedId && productQuery.loading ? (
        <Card>
          <LoadingState message="Loading product SEO…" />
        </Card>
      ) : null}
      {selectedId && productQuery.error ? (
        <Card>
          <ErrorState message={productQuery.error} onRetry={() => void productQuery.reload()} />
        </Card>
      ) : null}
      {productQuery.data ? (
        <ProductSeoForm
          key={productQuery.data.id}
          product={productQuery.data}
          onSaved={() => void productQuery.reload()}
        />
      ) : null}
    </div>
  );
}

function ProductSeoForm({
  product,
  onSaved,
}: {
  product: AdminProduct;
  onSaved: () => void;
}) {
  const [metaTitle, setMetaTitle] = useState(product.seoTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(product.seoDescription ?? "");
  const [primaryKeyword, setPrimaryKeyword] = useState(product.primaryKeyword ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const resolvedPrimary = primaryKeyword.trim() || product.name.trim();
      await updateAdminProduct(product.id, {
        name: product.name,
        sku: product.sku,
        regularPrice: product.regularPrice || product.price,
        salePrice: product.salePrice > 0 ? product.salePrice : "",
        stock: product.stock,
        category: product.categoryId,
        subcategory: product.subcategoryId || undefined,
        childCategory: product.childCategoryId || undefined,
        status: toBackendProductStatus(product.status),
        shortDesc: product.shortDescription,
        longDesc: product.description,
        featuresContent: product.featuresContent,
        usageSafetyContent: product.usageSafetyContent,
        features: product.features,
        qandas: product.qandas,
        variants: product.variantAxes,
        variantPricing: product.variantPricing,
        variantStock: product.variantStock,
        variantSku: product.variantSku,
        variantMedia: product.variantMedia,
        weightClass: product.weightClassId,
        taxRate: product.taxRate,
        taxIncluded: product.taxIncluded,
        hsnCode: product.hsnCode,
        metaTitle,
        metaDescription,
        metaKeywords: product.metaKeywords,
        primaryKeyword: resolvedPrimary,
      });
      toast.success("Product SEO saved");
      onSaved();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Unable to save product SEO.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader title={product.name} description="Product meta via admin product update." />
        <div className="grid gap-4 p-4 sm:p-5">
          <Field label="Meta title" htmlFor="p-meta-title">
            <Input
              id="p-meta-title"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
            />
          </Field>
          <Field label="Meta description" htmlFor="p-meta-desc">
            <Textarea
              id="p-meta-desc"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              rows={3}
            />
          </Field>
          <Field label="Primary keyword" htmlFor="p-primary">
            <Input
              id="p-primary"
              value={primaryKeyword}
              onChange={(e) => setPrimaryKeyword(e.target.value)}
              placeholder="Defaults to product name when empty"
            />
          </Field>
          {saveError ? (
            <p className="text-sm text-danger" role="alert">
              {saveError}
            </p>
          ) : null}
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save product SEO"}
          </Button>
        </div>
      </Card>
    </>
  );
}

function CategoriesSeoTab() {
  const categoriesQuery = useAdminResource(() => fetchAdminCategories(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = (categoriesQuery.data ?? []).find((c) => c.id === selectedId) ?? null;

  if (categoriesQuery.loading) {
    return (
      <Card>
        <LoadingState message="Loading categories…" />
      </Card>
    );
  }
  if (categoriesQuery.error) {
    return (
      <Card>
        <ErrorState
          message={categoriesQuery.error}
          onRetry={() => void categoriesQuery.reload()}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <ul className="divide-y divide-border max-h-64 overflow-auto">
          {(categoriesQuery.data ?? []).map((category) => (
            <li key={category.id}>
              <button
                type="button"
                className={cn(
                  "w-full px-4 py-3 text-left text-sm hover:bg-muted",
                  selectedId === category.id && "bg-muted",
                )}
                onClick={() => setSelectedId(category.id)}
              >
                {category.name}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {selected ? (
        <CategorySeoForm
          key={selected.id}
          category={selected}
          onSaved={() => void categoriesQuery.reload()}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Select a category to edit title and description.</p>
      )}
    </div>
  );
}

function CategorySeoForm({
  category,
  onSaved,
}: {
  category: AdminCategory;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(category.title ?? "");
  const [description, setDescription] = useState(category.description ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateAdminCategory(category.id, {
        name: category.name,
        isActive: category.status !== "Inactive",
        taxRate: category.taxRate,
        title,
        description,
      });
      toast.success("Category SEO saved");
      onSaved();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Unable to save category SEO.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader title={category.name} description="Category title / description fields." />
        <div className="grid gap-4 p-4 sm:p-5">
          <Field label="Title" htmlFor="cat-title">
            <Input id="cat-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="cat-desc">
            <Textarea
              id="cat-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Field>
          {saveError ? (
            <p className="text-sm text-danger" role="alert">
              {saveError}
            </p>
          ) : null}
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save category SEO"}
          </Button>
        </div>
      </Card>
    </>
  );
}

function MerchSeoTab({ kind }: { kind: "collections" | "occasions" }) {
  const query = useAdminResource(() => fetchAdminMerch(kind), [kind]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = (query.data ?? []).find((item) => item.id === selectedId) ?? null;

  if (query.loading) {
    return (
      <Card>
        <LoadingState message={`Loading ${kind}…`} />
      </Card>
    );
  }
  if (query.error) {
    return (
      <Card>
        <ErrorState message={query.error} onRetry={() => void query.reload()} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <ul className="divide-y divide-border max-h-64 overflow-auto">
          {(query.data ?? []).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  "w-full px-4 py-3 text-left text-sm hover:bg-muted",
                  selectedId === item.id && "bg-muted",
                )}
                onClick={() => setSelectedId(item.id)}
              >
                {item.name || item.slug || item.id}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {selected ? (
        <MerchSeoForm
          key={selected.id}
          kind={kind}
          item={selected}
          onSaved={() => void query.reload()}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a {kind === "collections" ? "collection" : "occasion"} to edit SEO fields.
        </p>
      )}
    </div>
  );
}

function MerchSeoForm({
  kind,
  item,
  onSaved,
}: {
  kind: "collections" | "occasions";
  item: AdminMerchItem;
  onSaved: () => void;
}) {
  const [seoTitle, setSeoTitle] = useState(item.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(item.seoDescription ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateAdminMerch(kind, item.id, {
        name: item.name,
        slug: item.slug,
        description: item.description,
        imageUrl: item.imageUrl,
        imageAlt: item.imageAlt,
        productIds: item.productIds,
        isActive: item.isActive,
        showOnHome: item.showOnHome,
        displayOrder: item.displayOrder,
        seoTitle,
        seoDescription,
      });
      toast.success("SEO saved");
      onSaved();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Unable to save SEO.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title={item.name || item.slug}
          description={`seoTitle / seoDescription via merchandising ${kind} API.`}
        />
        <div className="grid gap-4 p-4 sm:p-5">
          <Field label="SEO title" htmlFor={`${kind}-seo-title`}>
            <Input
              id={`${kind}-seo-title`}
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
            />
          </Field>
          <Field label="SEO description" htmlFor={`${kind}-seo-desc`}>
            <Textarea
              id={`${kind}-seo-desc`}
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              rows={3}
            />
          </Field>
          {saveError ? (
            <p className="text-sm text-danger" role="alert">
              {saveError}
            </p>
          ) : null}
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save SEO"}
          </Button>
        </div>
      </Card>
    </>
  );
}

function CmsSeoTab() {
  const query = useAdminResource(() => fetchStaticPageRegistry(), []);

  if (query.loading) {
    return (
      <Card>
        <LoadingState message="Loading pages…" />
      </Card>
    );
  }
  if (query.error) {
    return (
      <Card>
        <ErrorState message={query.error} onRetry={() => void query.reload()} />
      </Card>
    );
  }

  const pages = query.data ?? [];
  return (
    <Card>
      <CardHeader
        title="Page search listings"
        description="Edit title and description in each page editor."
      />
      {pages.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No editable pages.</p>
      ) : (
        <ul className="divide-y divide-border">
          {pages.map((page) => (
            <li key={page.pageKey}>
              <Link
                href={`/admin/cms/${page.pageKey}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 text-sm hover:bg-muted"
              >
                <span>
                  <span className="font-medium">{page.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{page.slug}</span>
                </span>
                <span className="text-accent">Open editor</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
