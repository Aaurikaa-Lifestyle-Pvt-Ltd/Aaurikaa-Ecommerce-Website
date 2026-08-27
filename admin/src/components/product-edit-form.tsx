"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";
import { toast } from "@/lib/toast";
import { CategoryTaxonomyFields } from "@/components/category-taxonomy-fields";
import {
  ProductGalleryMediaField,
  ProductSingleMediaField,
} from "@/components/product-media-fields";
import { ProductContentEditor } from "@/components/structured-editor";
import {
  ProductVariantsEditor,
  type VariantEditorState,
} from "@/components/product-variants-editor";
import { StatusBadge } from "@/components/status-badge";
import {
  autoSaveAdminProduct,
  createAdminProduct,
  fetchLatestAdminDraft,
  updateAdminProduct,
  type AdminProductAutosaveInput,
} from "@/lib/api/products";
import { uploadAdminMedia } from "@/lib/api/media";
import type { WeightClassOption } from "@/lib/api/shipping";
import { ApiError } from "@/lib/api/errors";
import type { ProductMediaSlot } from "@/lib/mappers/product-write";
import { useAutoSave } from "../lib/use-auto-save.ts";
import {
  isDraftProductStatus,
  isPublishedProductStatus,
  productLifecycleLabel,
  requireWeightClassForPublish,
  resolveLifecycleWriteStatus,
  type ProductLifecycleAction,
} from "@/lib/product-lifecycle";
import { normalizeManufacturerConditions } from "@/lib/product-jewellery-content";
import { buildMediaAutosaveSignature } from "@/lib/media-autosave";
import { richTextToPlainText } from "@/lib/rich-text/rich-text-utils";
import { resolveProductTaxWrite } from "@/lib/tax-rate-input";
import type {
  AdminCategory,
  AdminManufacturerConditions,
  AdminProduct,
  AdminProductFeature,
  AdminProductQanda,
  ProductStatus,
} from "@/types/admin";

export type ProductEditFormProps = {
  mode: "create" | "edit";
  product?: AdminProduct | null;
  categories: AdminCategory[];
  slabs: WeightClassOption[];
  onReload?: () => Promise<void>;
};

const EMPTY_VARIANTS: VariantEditorState = {
  axes: [],
  pricing: {},
  stock: {},
  sku: {},
  media: {},
  mediaFiles: {},
};

/** Persist local File slots via media library so JSON autosave can send URLs. */
async function resolveMediaSlotForAutosave(
  slot: ProductMediaSlot | undefined,
): Promise<ProductMediaSlot | undefined> {
  if (!slot) return undefined;
  if (!slot.file) return slot;
  const uploaded = await uploadAdminMedia({ file: slot.file });
  if (!uploaded?.url) {
    throw new Error("Media upload failed during draft auto-save.");
  }
  return { url: uploaded.url, mediaId: uploaded.id, file: null };
}

async function resolveGallerySlotsForAutosave(
  slots: ProductMediaSlot[],
): Promise<ProductMediaSlot[]> {
  const next: ProductMediaSlot[] = [];
  for (const slot of slots) {
    const resolved = await resolveMediaSlotForAutosave(slot);
    if (resolved) next.push(resolved);
  }
  return next;
}

export function ProductEditForm({
  mode,
  product,
  categories,
  slabs,
  onReload,
}: ProductEditFormProps) {
  const router = useRouter();
  const isCreateMode = mode === "create";
  /** After first autosave, draft id is bound in-place (no remount) so Care/Media/FAQ are not dropped. */
  const [boundProductId, setBoundProductId] = useState<string | null>(
    product?.id ?? null,
  );
  const isUnboundCreate = isCreateMode && !boundProductId;
  const editingProductId = boundProductId ?? product?.id ?? null;

  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  // Echo-only: preserve featuresContent / SEO without form-owned editors.
  const [featuresContent] = useState(
    () => richTextToPlainText(product?.featuresContent ?? ""),
  );
  // Care uses ProductStructuredEditor (TipTap JSON).
  const [usageSafetyContent, setUsageSafetyContent] = useState(
    product?.usageSafetyContent ?? "",
  );
  const [manufacturerConditions, setManufacturerConditions] =
    useState<AdminManufacturerConditions>(() =>
      normalizeManufacturerConditions(product?.manufacturerConditions),
    );
  const [features, setFeatures] = useState<AdminProductFeature[]>(
    () => product?.features ?? [],
  );
  const [qandas, setQandas] = useState<AdminProductQanda[]>(product?.qandas ?? []);
  // SEO fields retained in state (no UI card) so saves do not wipe metadata. Edit via /admin/seo.
  const [metaTitle] = useState(product?.seoTitle ?? "");
  const [metaDescription] = useState(product?.seoDescription ?? "");
  const [metaKeywords] = useState(product?.metaKeywords ?? "");
  // Echo existing primaryKeyword only; never force name (admin publish auto-fill skip).
  const [primaryKeyword] = useState(product?.primaryKeyword ?? "");
  // Sale Price ↔ backend salePrice; List Price ↔ backend regularPrice (form fields, not display mapping).
  const [price, setPrice] = useState(
    product?.salePrice && product.salePrice > 0 ? String(product.salePrice) : "",
  );
  const [compareAt, setCompareAt] = useState(
    product?.regularPrice && product.regularPrice > 0
      ? String(product.regularPrice)
      : "",
  );
  const [stock, setStock] = useState(product ? String(product.stock) : "0");
  const [weight, setWeight] = useState(
    product?.weight != null ? String(product.weight) : "",
  );
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? "Draft");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [subcategoryId, setSubcategoryId] = useState(product?.subcategoryId ?? "");
  const [childCategoryId, setChildCategoryId] = useState(product?.childCategoryId ?? "");
  const [weightClassId, setWeightClassId] = useState(product?.weightClassId || "");
  const [gstMode, setGstMode] = useState<"category" | "override">(
    product && product.taxRate > 0 ? "override" : "category",
  );
  const [taxRateOverride, setTaxRateOverride] = useState(
    product && product.taxRate > 0 ? String(product.taxRate) : "",
  );
  const [taxIncluded, setTaxIncluded] = useState(product?.taxIncluded ?? false);
  const [hsnCode, setHsnCode] = useState(product?.hsnCode ?? "");
  const [mainImage, setMainImage] = useState<ProductMediaSlot | undefined>(
    product?.image && !product.image.includes("placeholder")
      ? { url: product.image, mediaId: product.mainImageId }
      : undefined,
  );
  const [gallerySlots, setGallerySlots] = useState<ProductMediaSlot[]>(
    product?.galleryImages.map((url, index) => ({
      url,
      mediaId: product.galleryImageIds[index],
    })) ?? [],
  );
  const [video, setVideo] = useState<ProductMediaSlot | undefined>(
    product?.video ? { url: product.video, mediaId: product.videoId } : undefined,
  );
  const [variants, setVariants] = useState<VariantEditorState>(
    product
      ? {
          axes: product.variantAxes,
          pricing: product.variantPricing,
          stock: product.variantStock,
          sku: product.variantSku,
          media: product.variantMedia,
          mediaFiles: {},
        }
      : EMPTY_VARIANTS,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftPromptHandled, setDraftPromptHandled] = useState(false);
  const [restoreBaselineToken, setRestoreBaselineToken] = useState<string | null>(null);
  const [draftSavedFlash, setDraftSavedFlash] = useState(false);
  const mainImageRef = useRef(mainImage);
  const gallerySlotsRef = useRef(gallerySlots);
  const videoRef = useRef(video);
  const boundProductIdRef = useRef(boundProductId);

  useEffect(() => {
    mainImageRef.current = mainImage;
  }, [mainImage]);
  useEffect(() => {
    gallerySlotsRef.current = gallerySlots;
  }, [gallerySlots]);
  useEffect(() => {
    videoRef.current = video;
  }, [video]);
  useEffect(() => {
    boundProductIdRef.current = boundProductId;
  }, [boundProductId]);

  function buildWriteInput(taxRate: number, action: ProductLifecycleAction) {
    const writeStatus = isUnboundCreate
      ? "draft"
      : resolveLifecycleWriteStatus(status, action);
    const keyword = primaryKeyword.trim();
    return {
      name,
      sku,
      regularPrice: compareAt || price,
      salePrice: compareAt ? price : "",
      stock,
      category: categoryId,
      subcategory: subcategoryId || undefined,
      childCategory: childCategoryId || undefined,
      status: writeStatus,
      // Omit shortDesc — preserve any legacy value; description lives in longDesc only.
      longDesc: description,
      featuresContent,
      usageSafetyContent,
      // Clear AAURIKAA fixed care-row UI; care lives in usageSafetyContent.
      usageInstructions: [],
      manufacturerConditions,
      features,
      qandas,
      variants: variants.axes,
      variantPricing: variants.pricing,
      variantStock: variants.stock,
      variantSku: variants.sku,
      variantMedia: variants.media,
      variantMediaFiles: variants.mediaFiles,
      // Draft may omit; publish path validates client-side. Do not invent a slab.
      weightClass: weightClassId || undefined,
      weight: weight || undefined,
      mainImage,
      galleryImages: gallerySlots,
      video,
      // 0 keeps GST engine on category hierarchy fallback; never copy category rate here
      taxRate,
      taxIncluded,
      hsnCode,
      metaTitle,
      metaDescription,
      metaKeywords,
      ...(keyword ? { primaryKeyword: keyword } : {}),
    };
  }

  const autosavePayload = useMemo((): AdminProductAutosaveInput => {
    const keyword = primaryKeyword.trim();
    return {
      name,
      sku,
      regularPrice: compareAt || price || 0,
      salePrice: compareAt ? price : "",
      stock,
      category: categoryId || undefined,
      subcategory: subcategoryId || undefined,
      childCategory: childCategoryId || undefined,
      status: "draft",
      longDesc: description,
      featuresContent,
      usageSafetyContent,
      usageInstructions: [],
      manufacturerConditions,
      features,
      qandas,
      variants: variants.axes,
      variantPricing: variants.pricing,
      variantStock: variants.stock,
      variantSku: variants.sku,
      variantMedia: variants.media,
      weightClass: weightClassId || undefined,
      weight: weight || undefined,
      mainImage: mainImage?.url,
      mainImageId: mainImage?.mediaId,
      galleryImages: gallerySlots.map((s) => s.url).filter(Boolean) as string[],
      galleryImageIds: gallerySlots.map((s) => s.mediaId).filter(Boolean) as string[],
      video: video?.url,
      videoId: video?.mediaId,
      // Client-only dirty flag — stripped before POST. Forces autosave when File-only slots change.
      mediaSignature: buildMediaAutosaveSignature(mainImage, gallerySlots, video),
      taxRate: gstMode === "override" ? Number(taxRateOverride) || 0 : 0,
      taxIncluded,
      hsnCode,
      metaTitle,
      metaDescription,
      metaKeywords,
      ...(keyword ? { primaryKeyword: keyword } : {}),
    };
  }, [
    name,
    sku,
    compareAt,
    price,
    stock,
    categoryId,
    subcategoryId,
    childCategoryId,
    description,
    featuresContent,
    usageSafetyContent,
    manufacturerConditions,
    features,
    qandas,
    variants,
    weightClassId,
    weight,
    mainImage,
    gallerySlots,
    video,
    gstMode,
    taxRateOverride,
    taxIncluded,
    hsnCode,
    metaTitle,
    metaDescription,
    metaKeywords,
    primaryKeyword,
  ]);

  const autosaveEnabled =
    !saving &&
    Boolean(name.trim()) &&
    (isUnboundCreate || isDraftProductStatus(status)) &&
    !isPublishedProductStatus(status);

  const onAutosaveSuccess = useCallback(
    (savedProduct: AdminProduct) => {
      setDraftSavedFlash(true);
      window.setTimeout(() => setDraftSavedFlash(false), 1600);
      // ANBAZAR pattern: keep the form mounted after first draft create so TipTap /
      // Features / FAQ / Media edits are not wiped by a Next.js remount.
      if (isCreateMode && savedProduct.id && !boundProductId) {
        boundProductIdRef.current = savedProduct.id;
        setBoundProductId(savedProduct.id);
        if (typeof window !== "undefined") {
          window.history.replaceState(
            null,
            "",
            `/admin/products/${savedProduct.id}`,
          );
        }
      }
    },
    [isCreateMode, boundProductId],
  );

  const { isSaving: isDraftAutosaving, setDraftId } = useAutoSave<
    AdminProductAutosaveInput,
    AdminProduct
  >({
    data: autosavePayload,
    enabled: autosaveEnabled,
    debounceMs: 5000,
    initialDraftId: editingProductId,
    baselineSyncToken: restoreBaselineToken,
    save: async (
      payload: AdminProductAutosaveInput & { id?: string },
      signal: AbortSignal,
    ) => {
      // JSON autosave cannot carry File blobs — upload first, then send URLs.
      const resolvedMain = await resolveMediaSlotForAutosave(mainImageRef.current);
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const resolvedGallery = await resolveGallerySlotsForAutosave(
        gallerySlotsRef.current,
      );
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const resolvedVideo = await resolveMediaSlotForAutosave(videoRef.current);
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const hadPendingFiles =
        Boolean(mainImageRef.current?.file) ||
        Boolean(videoRef.current?.file) ||
        gallerySlotsRef.current.some((s) => Boolean(s.file));

      const { mediaSignature: _mediaSignature, ...rest } = payload;
      const draftId = payload.id ?? boundProductIdRef.current ?? undefined;
      const autosaveBody: AdminProductAutosaveInput = {
        ...rest,
        ...(draftId ? { id: draftId } : {}),
        mainImage: resolvedMain?.url,
        mainImageId: resolvedMain?.mediaId,
        galleryImages: resolvedGallery.map((s) => s.url).filter(Boolean) as string[],
        galleryImageIds: resolvedGallery
          .map((s) => s.mediaId)
          .filter(Boolean) as string[],
        video: resolvedVideo?.url,
        videoId: resolvedVideo?.mediaId,
      };

      const result = await autoSaveAdminProduct(autosaveBody, { signal });
      if (!result) throw new Error("Draft auto-save returned empty product.");

      if (hadPendingFiles) {
        setMainImage(resolvedMain);
        setGallerySlots(resolvedGallery);
        setVideo(resolvedVideo);
        mainImageRef.current = resolvedMain;
        gallerySlotsRef.current = resolvedGallery;
        videoRef.current = resolvedVideo;
      }

      if (result.id) {
        boundProductIdRef.current = result.id;
      }

      const resolvedDraftId = draftId ?? result.id;
      const savedSnapshot = JSON.stringify({
        ...rest,
        ...(resolvedDraftId ? { id: resolvedDraftId } : {}),
        mainImage: resolvedMain?.url,
        mainImageId: resolvedMain?.mediaId,
        galleryImages: resolvedGallery.map((s) => s.url).filter(Boolean) as string[],
        galleryImageIds: resolvedGallery
          .map((s) => s.mediaId)
          .filter(Boolean) as string[],
        video: resolvedVideo?.url,
        videoId: resolvedVideo?.mediaId,
        mediaSignature: buildMediaAutosaveSignature(
          resolvedMain,
          resolvedGallery,
          resolvedVideo,
        ),
      });

      return { ...result, savedSnapshot };
    },
    onSaveSuccess: onAutosaveSuccess,
  });

  // Latest-draft restore on create (ANBAZAR behavior).
  useEffect(() => {
    if (!isUnboundCreate || draftPromptHandled) return;
    let cancelled = false;
    (async () => {
      try {
        const draft = await fetchLatestAdminDraft();
        if (cancelled || !draft?.id) return;
        const when = draft.id; // id always present when mapped
        const confirmRestore = window.confirm(
          "Found an unsaved product draft. Do you want to restore it?",
        );
        if (confirmRestore) {
          setDraftId(draft.id);
          setBoundProductId(draft.id);
          setRestoreBaselineToken(when);
          router.replace(`/admin/products/${draft.id}`);
          return;
        }
      } catch {
        // Non-blocking — operator can still create a new draft.
      } finally {
        if (!cancelled) setDraftPromptHandled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isUnboundCreate, draftPromptHandled, router, setDraftId]);

  async function handleLifecycleSave(action: ProductLifecycleAction) {
    if (action === "publish") {
      const slabError = requireWeightClassForPublish(weightClassId);
      if (slabError) {
        setSaveError(slabError);
        return;
      }
    }

    const taxWrite = resolveProductTaxWrite(gstMode, taxRateOverride);
    if (!taxWrite.ok) {
      setSaveError(taxWrite.error);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      if (isUnboundCreate) {
        const created = await createAdminProduct({
          ...buildWriteInput(taxWrite.value, "save"),
          status: "draft",
        });
        if (!created?.id) {
          throw new Error("Product created without an id.");
        }
        router.replace(`/admin/products/${created.id}`);
        return;
      }

      const productId = editingProductId;
      if (!productId) {
        throw new Error("Product is missing.");
      }

      const hadMain = Boolean(
        product?.mainImageId ||
          (product?.image && !product.image.includes("placeholder")),
      );
      const hadVideo = Boolean(product?.video);
      const hadGallery = Boolean(product?.galleryImages?.length);

      await updateAdminProduct(productId, {
        ...buildWriteInput(taxWrite.value, action),
        clearMainImage: hadMain && !mainImage,
        clearVideo: hadVideo && !video,
        clearGallery: hadGallery && gallerySlots.length === 0,
      });

      if (action === "publish") setStatus("Published");
      else if (action === "unpublish") setStatus("Draft");

      toast.success(
        action === "publish"
          ? "Product published"
          : action === "unpublish"
            ? "Product unpublished"
            : "Product saved",
      );
      await onReload?.();
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? err.message
          : action === "publish"
            ? "Unable to publish product."
            : action === "unpublish"
              ? "Unable to unpublish product."
              : "Unable to save product.",
      );
    } finally {
      setSaving(false);
    }
  }

  const title = isUnboundCreate ? "New product" : product?.name || name || "Product";
  const descriptionLine = isUnboundCreate
    ? "Creates a draft on first save, then opens the full editor."
    : product?.sku || sku
      ? `SKU ${product?.sku || sku}`
      : undefined;
  const showPublish = !isUnboundCreate && isDraftProductStatus(status);
  const showUnpublish = !isUnboundCreate && isPublishedProductStatus(status);
  const draftStatusLabel = isDraftAutosaving
    ? "Saving draft…"
    : draftSavedFlash
      ? "Draft saved"
      : null;

  return (
    <div>
      <PageHeader
        title={title}
        description={descriptionLine}
        action={
          <>
            <Link
              href="/admin/products"
              className="inline-flex h-11 items-center rounded-[var(--radius-sm)] border border-border bg-surface px-4 text-sm font-medium"
            >
              Back
            </Link>
            {showUnpublish ? (
              <Button
                variant="secondary"
                onClick={() => void handleLifecycleSave("unpublish")}
                disabled={saving || !name.trim()}
              >
                {saving ? "Saving…" : "Unpublish"}
              </Button>
            ) : null}
            {showPublish ? (
              <Button
                variant="secondary"
                onClick={() => void handleLifecycleSave("publish")}
                disabled={saving || !name.trim()}
              >
                {saving ? "Saving…" : "Publish"}
              </Button>
            ) : null}
            <Button
              onClick={() => void handleLifecycleSave("save")}
              disabled={saving || !name.trim()}
            >
              {saving ? "Saving…" : isUnboundCreate ? "Save draft" : "Save"}
            </Button>
          </>
        }
      />

      {saveError ? (
        <p className="mb-4 text-sm text-danger" role="alert">
          {saveError}
        </p>
      ) : null}

      {draftStatusLabel ? (
        <p className="mb-4 text-xs text-muted-foreground" aria-live="polite">
          {draftStatusLabel}
        </p>
      ) : null}

      <div className="space-y-4">
        <Card>
          <CardHeader title="Basic Information" />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field label="Product name" htmlFor="name">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="SKU" htmlFor="sku">
              <Input
                id="sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Leave blank to auto-generate"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Optional for new products. Leave blank and the store will generate a SKU.
              </p>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Category"
            description="Uses the existing Category → Subcategory → Child Category hierarchy."
          />
          <div className="space-y-4 p-4 sm:p-5">
            <CategoryTaxonomyFields
              categories={categories}
              categoryId={categoryId}
              subcategoryId={subcategoryId}
              childCategoryId={childCategoryId}
              onCategoryChange={setCategoryId}
              onSubcategoryChange={setSubcategoryId}
              onChildCategoryChange={setChildCategoryId}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Pricing, stock & shipping"
            description="List price is MRP. Sale price is what customers pay when it is set and lower than list price."
          />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field label="List Price (INR)" htmlFor="compare">
              <Input
                id="compare"
                type="number"
                min={0}
                step="0.01"
                value={compareAt}
                onChange={(e) => setCompareAt(e.target.value)}
                placeholder="MRP"
              />
            </Field>
            <Field label="Sale Price (INR)" htmlFor="price">
              <Input
                id="price"
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Selling price"
              />
            </Field>
            <Field label="Stock" htmlFor="stock">
              <Input
                id="stock"
                type="number"
                min={0}
                step="1"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            </Field>
            <Field label="Weight (grams)" htmlFor="weight">
              <Input
                id="weight"
                type="number"
                min={0}
                step="0.01"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Status" className="sm:col-span-1">
              <div className="flex min-h-11 items-center gap-2">
                <StatusBadge
                  status={isUnboundCreate ? "Draft" : status}
                  kind="product"
                />
                <span className="text-sm text-muted-foreground">
                  {isUnboundCreate
                    ? "New products save as draft."
                    : isPublishedProductStatus(status)
                      ? "Live on the storefront. Save keeps it published."
                      : isDraftProductStatus(status)
                        ? "Not live. Use Publish when ready."
                        : productLifecycleLabel(status)}
                </span>
              </div>
            </Field>
            <Field label="Shipping slab" htmlFor="slab" className="sm:col-span-2">
              <Select
                id="slab"
                value={weightClassId}
                onChange={(e) => setWeightClassId(e.target.value)}
              >
                <option value="">Select shipping slab</option>
                {slabs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Used at checkout to calculate shipping. Required before Publish; drafts may leave it
                empty.
              </p>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="GST"
            description="Use the category GST rate unless this product needs a different rate. HSN is optional."
          />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field label="GST Rate" htmlFor="gst-mode">
              <Select
                id="gst-mode"
                value={gstMode}
                onChange={(e) => setGstMode(e.target.value as "category" | "override")}
              >
                <option value="category">Use category rate</option>
                <option value="override">Set a product rate</option>
              </Select>
            </Field>
            {gstMode === "override" ? (
              <Field label="GST Rate (%)" htmlFor="gst-rate">
                <Input
                  id="gst-rate"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={taxRateOverride}
                  onChange={(e) => setTaxRateOverride(e.target.value)}
                />
              </Field>
            ) : (
              <p className="self-end pb-2 text-sm text-muted-foreground sm:col-span-1">
                GST follows Child Category → Subcategory → Category when no product rate is set.
              </p>
            )}
            <Field label="Price includes GST?" htmlFor="tax-included">
              <Select
                id="tax-included"
                value={taxIncluded ? "yes" : "no"}
                onChange={(e) => setTaxIncluded(e.target.value === "yes")}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </Select>
            </Field>
            <Field label="HSN Code" htmlFor="hsn-code">
              <Input
                id="hsn-code"
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Media"
            description="Upload from your computer or choose existing Gallery assets. The first gallery image is not the main image."
          />
          <div className="grid gap-6 p-4 sm:grid-cols-2 sm:p-5">
            <ProductSingleMediaField
              label="Main image"
              htmlFor="main-image"
              accept="image/*"
              mediaType="image"
              slot={mainImage}
              onChange={setMainImage}
            />
            <ProductSingleMediaField
              label="Product video"
              htmlFor="product-video"
              accept="video/*"
              mediaType="video"
              slot={video}
              onChange={setVideo}
            />
            <div className="sm:col-span-2">
              <ProductGalleryMediaField slots={gallerySlots} onChange={setGallerySlots} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Variants"
            description="Optional. Add options such as Colour, Size, or Metal. Each combination can have its own SKU, price, stock, and photos."
          />
          <ProductVariantsEditor value={variants} onChange={setVariants} baseSku={sku} />
        </Card>

        <ProductContentEditor
          description={description}
          onDescriptionChange={setDescription}
          usageSafetyContent={usageSafetyContent}
          onUsageSafetyContentChange={setUsageSafetyContent}
          manufacturerConditions={manufacturerConditions}
          onManufacturerConditionsChange={setManufacturerConditions}
          features={features}
          onFeaturesChange={setFeatures}
          qandas={qandas}
          onQandasChange={setQandas}
        />
      </div>
    </div>
  );
}
