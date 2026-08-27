"use client";

import { useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import {
  createAdminMerch,
  deleteAdminMerch,
  fetchAdminMerch,
  updateAdminMerch,
  type AdminMerchItem,
  type AdminMerchKind,
  type MerchWriteInput,
} from "@/lib/api/merchandising";
import { ApiError } from "@/lib/api/errors";
import { toast } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";

type FieldKey =
  | "name"
  | "slug"
  | "description"
  | "imageUrl"
  | "imageAlt"
  | "mobileImageUrl"
  | "seoTitle"
  | "seoDescription"
  | "ctaLabel"
  | "ctaHref"
  | "mediaType"
  | "videoUrl"
  | "creatorName"
  | "caption"
  | "externalUrl"
  | "productIds"
  | "showOnHome"
  | "displayOrder"
  | "isActive";

const EMPTY: AdminMerchItem = {
  id: "",
  name: "",
  slug: "",
  description: "",
  imageUrl: "",
  imageAlt: "",
  mobileImageUrl: "",
  mobileImageAlt: "",
  seoTitle: "",
  seoDescription: "",
  ctaLabel: "",
  ctaHref: "",
  mediaType: "image",
  videoUrl: "",
  creatorName: "",
  caption: "",
  externalUrl: "",
  productIds: "",
  isActive: false,
  showOnHome: false,
  displayOrder: 0,
  status: "Inactive",
};

function toPayload(kind: AdminMerchKind, form: AdminMerchItem): MerchWriteInput {
  const productIds = form.productIds;
  const shared = {
    description: form.description,
    imageUrl: form.imageUrl,
    imageAlt: form.imageAlt,
    productIds,
    isActive: form.isActive,
    displayOrder: Number(form.displayOrder) || 0,
  };
  if (kind === "looks") {
    return {
      ...shared,
      title: form.name,
      slug: form.slug,
      mobileImageUrl: form.mobileImageUrl,
      mobileImageAlt: form.mobileImageAlt,
      ctaLabel: form.ctaLabel,
      ctaHref: form.ctaHref,
    };
  }
  if (kind === "ugc") {
    return {
      ...shared,
      mediaType: form.mediaType,
      videoUrl: form.videoUrl,
      creatorName: form.creatorName,
      caption: form.caption,
      externalUrl: form.externalUrl,
    };
  }
  return {
    ...shared,
    name: form.name,
    slug: form.slug,
    seoTitle: form.seoTitle,
    seoDescription: form.seoDescription,
    showOnHome: form.showOnHome,
  };
}

export function MerchandisingEditor({
  kind,
  title,
  description,
  fields,
}: {
  kind: AdminMerchKind;
  title: string;
  description: string;
  fields: FieldKey[];
}) {
  const query = useAdminResource(() => fetchAdminMerch(kind), [kind]);
  const items = query.data ?? [];
  const [editing, setEditing] = useState<AdminMerchItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<AdminMerchItem>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openAdd() {
    setAdding(true);
    setEditing(null);
    setForm({ ...EMPTY });
    setFormError(null);
  }

  function openEdit(item: AdminMerchItem) {
    setEditing(item);
    setAdding(false);
    setForm({ ...item });
    setFormError(null);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      const payload = toPayload(kind, form);
      if (editing) {
        await updateAdminMerch(kind, editing.id, payload);
      } else {
        await createAdminMerch(kind, payload);
      }
      setAdding(false);
      setEditing(null);
      toast.success(editing ? "Item updated" : "Item created");
      await query.reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: AdminMerchItem) {
    if (!window.confirm("Delete this item? This cannot be undone.")) return;
    setSaving(true);
    setFormError(null);
    try {
      await deleteAdminMerch(kind, item.id);
      if (editing?.id === item.id) {
        setEditing(null);
        setAdding(false);
      }
      toast.success("Item deleted");
      await query.reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unable to delete.");
    } finally {
      setSaving(false);
    }
  }

  if (query.loading) return <LoadingState />;
  if (query.error) return <ErrorState message={query.error} onRetry={() => void query.reload()} />;

  const showForm = adding || editing;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        action={
          <Button type="button" onClick={openAdd}>
            Add
          </Button>
        }
      />
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
      {items.length === 0 && !showForm ? (
        <EmptyState message="Nothing published yet. Add an item when content is ready — do not invent catalogue copy here." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{item.name || item.creatorName || item.caption || item.id}</p>
                <p className="text-xs text-muted-foreground">
                  Order {item.displayOrder}
                  {item.slug ? ` · /${item.slug}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={item.status} />
                <Button type="button" variant="secondary" onClick={() => openEdit(item)}>
                  Edit
                </Button>
                <Button type="button" variant="secondary" onClick={() => void remove(item)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm ? (
        <Card className="space-y-4 p-4">
          {fields.includes("name") ? (
            <Field label={kind === "looks" ? "Title" : "Name"} htmlFor="merch-name">
              <Input
                id="merch-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
          ) : null}
          {fields.includes("creatorName") ? (
            <Field label="Creator / customer" htmlFor="merch-creator">
              <Input
                id="merch-creator"
                value={form.creatorName}
                onChange={(e) => setForm({ ...form, creatorName: e.target.value })}
              />
            </Field>
          ) : null}
          {fields.includes("slug") ? (
            <Field label="Slug" htmlFor="merch-slug">
              <Input
                id="merch-slug"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="Leave blank to generate from the name"
              />
            </Field>
          ) : null}
          {fields.includes("description") ? (
            <Field label="Content" htmlFor="merch-description">
              <Textarea
                id="merch-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
          ) : null}
          {fields.includes("caption") ? (
            <Field label="Caption" htmlFor="merch-caption">
              <Textarea
                id="merch-caption"
                value={form.caption}
                onChange={(e) => setForm({ ...form, caption: e.target.value })}
              />
            </Field>
          ) : null}
          {fields.includes("imageUrl") ? (
            <Field label="Image URL (DAM)" htmlFor="merch-image">
              <Input
                id="merch-image"
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="https://… client DAM URL (CONFIGURE)"
              />
            </Field>
          ) : null}
          {fields.includes("imageAlt") ? (
            <Field label="Image alt" htmlFor="merch-alt">
              <Input
                id="merch-alt"
                value={form.imageAlt}
                onChange={(e) => setForm({ ...form, imageAlt: e.target.value })}
              />
            </Field>
          ) : null}
          {fields.includes("mobileImageUrl") ? (
            <Field label="Mobile image URL (DAM)" htmlFor="merch-mobile">
              <Input
                id="merch-mobile"
                value={form.mobileImageUrl}
                onChange={(e) => setForm({ ...form, mobileImageUrl: e.target.value })}
                placeholder="Optional client DAM URL"
              />
            </Field>
          ) : null}
          {fields.includes("mediaType") ? (
            <Field label="Media type" htmlFor="merch-media-type">
              <Select
                id="merch-media-type"
                value={form.mediaType}
                onChange={(e) =>
                  setForm({ ...form, mediaType: e.target.value === "video" ? "video" : "image" })
                }
              >
                <option value="image">Image</option>
                <option value="video">Video</option>
              </Select>
            </Field>
          ) : null}
          {fields.includes("videoUrl") ? (
            <Field label="Video URL (DAM)" htmlFor="merch-video">
              <Input
                id="merch-video"
                value={form.videoUrl}
                onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                placeholder="https://… client DAM URL (CONFIGURE)"
              />
            </Field>
          ) : null}
          {fields.includes("seoTitle") ? (
            <Field label="SEO title" htmlFor="merch-seo-title">
              <Input
                id="merch-seo-title"
                value={form.seoTitle}
                onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
              />
            </Field>
          ) : null}
          {fields.includes("seoDescription") ? (
            <Field label="SEO description" htmlFor="merch-seo-desc">
              <Textarea
                id="merch-seo-desc"
                value={form.seoDescription}
                onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
              />
            </Field>
          ) : null}
          {fields.includes("ctaLabel") ? (
            <Field label="CTA label" htmlFor="merch-cta-label">
              <Input
                id="merch-cta-label"
                value={form.ctaLabel}
                onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
              />
            </Field>
          ) : null}
          {fields.includes("ctaHref") ? (
            <Field label="CTA link" htmlFor="merch-cta-href">
              <Input
                id="merch-cta-href"
                value={form.ctaHref}
                onChange={(e) => setForm({ ...form, ctaHref: e.target.value })}
              />
            </Field>
          ) : null}
          {fields.includes("externalUrl") ? (
            <Field label="External / social URL" htmlFor="merch-external">
              <Input
                id="merch-external"
                value={form.externalUrl}
                onChange={(e) => setForm({ ...form, externalUrl: e.target.value })}
              />
            </Field>
          ) : null}
          {fields.includes("productIds") ? (
            <Field label="Product IDs or SKUs" htmlFor="merch-products">
              <Textarea
                id="merch-products"
                value={form.productIds}
                onChange={(e) => setForm({ ...form, productIds: e.target.value })}
                placeholder="Comma-separated Product IDs or SKUs from the live catalogue. Leave empty until client products exist (CONFIGURE)."
              />
              {kind === "collections" &&
              form.slug.trim().toLowerCase() === "best-sellers" ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Best Sellers: with this collection active, these IDs pin storefront
                  Bestsellers (homepage + /collections/best-sellers) and override sales
                  ranking. Empty IDs fall back to sortBy=sales.
                </p>
              ) : null}
            </Field>
          ) : null}
          {fields.includes("displayOrder") ? (
            <Field label="Display order" htmlFor="merch-order">
              <Input
                id="merch-order"
                type="number"
                min={0}
                value={form.displayOrder}
                onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) || 0 })}
              />
            </Field>
          ) : null}
          {fields.includes("showOnHome") ? (
            <Field label="Show on homepage" htmlFor="merch-home">
              <Select
                id="merch-home"
                value={form.showOnHome ? "yes" : "no"}
                onChange={(e) => setForm({ ...form, showOnHome: e.target.value === "yes" })}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </Select>
            </Field>
          ) : null}
          {fields.includes("isActive") ? (
            <Field label="Visibility" htmlFor="merch-active">
              <Select
                id="merch-active"
                value={form.isActive ? "active" : "inactive"}
                onChange={(e) => setForm({ ...form, isActive: e.target.value === "active" })}
              >
                <option value="inactive">Hidden</option>
                <option value="active">Visible</option>
              </Select>
            </Field>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAdding(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
