"use client";

import Image from "next/image";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
} from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import {
  createAdminCategory,
  createAdminChildCategory,
  createAdminSubcategory,
  deleteAdminCategory,
  deleteAdminChildCategory,
  deleteAdminSubcategory,
  fetchAdminCategoryHierarchy,
  statusToIsActive,
  updateAdminCategory,
  updateAdminChildCategory,
  updateAdminSubcategory,
} from "@/lib/api/categories";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { formatTaxonomyTaxLabel, previewTaxonomySlug } from "@/lib/mappers/category";
import { isRemoteSrc } from "@/lib/mappers/media";
import { resolveTaxonomyTaxWrite } from "@/lib/tax-rate-input";
import { toast, toastMessageFromUnknown } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";
import type { AdminCategoryHierarchyRow, EntityStatus, TaxonomyTaxType } from "@/types/admin";

type TaxMode = "inherit" | "override";

type FormMode =
  | { kind: "create-category" }
  | {
      kind: "edit-category";
      catId: string;
      name: string;
      slug: string;
      status: EntityStatus;
      image: string;
      taxRate: number;
      taxType: TaxonomyTaxType;
    }
  | {
      kind: "create-subcategory";
      catId: string;
      categoryName: string;
    }
  | {
      kind: "edit-subcategory";
      subId: string;
      catId: string;
      categoryName: string;
      name: string;
      slug: string;
      image: string;
      taxRate: number | null;
      taxType: TaxonomyTaxType;
    }
  | {
      kind: "create-child";
      catId: string;
      categoryName: string;
      subId: string;
      subcategoryName: string;
    }
  | {
      kind: "edit-child";
      childId: string;
      catId: string;
      categoryName: string;
      subId: string;
      subcategoryName: string;
      name: string;
      slug: string;
      image: string;
      taxRate: number | null;
      taxType: TaxonomyTaxType;
    };

function thumb(src: string | undefined, alt: string) {
  if (!src) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-muted">
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover"
          sizes="36px"
          unoptimized={isRemoteSrc(src)}
        />
      </div>
      <span className="truncate text-sm font-medium">{alt}</span>
    </div>
  );
}

function formTitle(mode: FormMode): string {
  switch (mode.kind) {
    case "create-category":
      return "Add Category";
    case "edit-category":
      return "Edit Category";
    case "create-subcategory":
      return "Add Subcategory";
    case "edit-subcategory":
      return "Edit Subcategory";
    case "create-child":
      return "Add Child Category";
    case "edit-child":
      return "Edit Child Category";
  }
}

function hasSubcategory(row: AdminCategoryHierarchyRow): boolean {
  return Boolean(row.subId && row.subcategory !== "—");
}

function hasChildCategory(row: AdminCategoryHierarchyRow): boolean {
  return Boolean(row.childId && row.child !== "—");
}

type HierarchyRowActionsProps = {
  row: AdminCategoryHierarchyRow;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onEditCategory: () => void;
  onEditSubcategory: () => void;
  onEditChild: () => void;
  onAddSubcategory: () => void;
  onAddChild: () => void;
  onDeleteCategory: () => void;
  onDeleteSubcategory: () => void;
  onDeleteChild: () => void;
};

type MenuCoords = { top?: number; bottom?: number; left: number };

function MenuItem({
  children,
  onClick,
  tone = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-sm transition hover:bg-muted",
        tone === "danger" ? "text-danger hover:bg-red-50" : "text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function MenuSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  if (!children) return null;
  return (
    <div className="py-1">
      <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function HierarchyRowActions({
  row,
  menuOpen,
  onMenuOpenChange,
  onEditCategory,
  onEditSubcategory,
  onEditChild,
  onAddSubcategory,
  onAddChild,
  onDeleteCategory,
  onDeleteSubcategory,
  onDeleteChild,
}: HierarchyRowActionsProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const [mounted, setMounted] = useState(false);

  const withSub = hasSubcategory(row);
  const withChild = hasChildCategory(row);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen || !triggerRef.current) {
      setCoords(null);
      return;
    }

    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = 208;
      const estimatedHeight = withChild ? 300 : withSub ? 240 : 160;
      const gap = 6;
      const openUp = rect.bottom + gap + estimatedHeight > window.innerHeight - 8;
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        window.innerWidth - menuWidth - 8,
      );
      if (openUp) {
        setCoords({ bottom: window.innerHeight - (rect.top - gap), left });
      } else {
        setCoords({ top: rect.bottom + gap, left });
      }
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [menuOpen, withChild, withSub]);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onMenuOpenChange(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onMenuOpenChange(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, onMenuOpenChange]);

  function runAndClose(action: () => void) {
    onMenuOpenChange(false);
    action();
  }

  const menu =
    mounted && menuOpen && coords
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            style={{
              position: "fixed",
              top: coords.top,
              bottom: coords.bottom,
              left: coords.left,
              width: 208,
            }}
            className="z-50 rounded-[var(--radius-md)] border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)] animate-rise-in"
          >
            <MenuSection label="Category">
              <MenuItem onClick={() => runAndClose(onEditCategory)}>Edit category</MenuItem>
              <MenuItem onClick={() => runAndClose(onAddSubcategory)}>Add subcategory</MenuItem>
              <MenuItem tone="danger" onClick={() => runAndClose(onDeleteCategory)}>
                Delete category
              </MenuItem>
            </MenuSection>

            {withSub ? (
              <>
                <div className="mx-1 border-t border-border" />
                <MenuSection label="Subcategory">
                  <MenuItem onClick={() => runAndClose(onEditSubcategory)}>
                    Edit subcategory
                  </MenuItem>
                  <MenuItem onClick={() => runAndClose(onAddChild)}>Add child</MenuItem>
                  <MenuItem tone="danger" onClick={() => runAndClose(onDeleteSubcategory)}>
                    Delete subcategory
                  </MenuItem>
                </MenuSection>
              </>
            ) : null}

            {withChild ? (
              <>
                <div className="mx-1 border-t border-border" />
                <MenuSection label="Child">
                  <MenuItem onClick={() => runAndClose(onEditChild)}>Edit child</MenuItem>
                  <MenuItem tone="danger" onClick={() => runAndClose(onDeleteChild)}>
                    Delete child
                  </MenuItem>
                </MenuSection>
              </>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="flex justify-end">
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        size="sm"
        aria-label="Actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => onMenuOpenChange(!menuOpen)}
      >
        Actions
        <span aria-hidden className="text-muted-foreground">
          ▾
        </span>
      </Button>
      {menu}
    </div>
  );
}

export default function CategoriesPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("sortOrder");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const hierarchyQuery = useAdminResource(
    () =>
      fetchAdminCategoryHierarchy({
        page,
        limit: 10,
        search,
        sortBy,
        sortOrder,
      }),
    [page, search, sortBy, sortOrder],
  );

  const result = hierarchyQuery.data;
  const rows = result?.rows ?? [];
  const pagination = result?.pagination;

  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<EntityStatus>("Active");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [categoryTaxRate, setCategoryTaxRate] = useState("0");
  const [taxType, setTaxType] = useState<TaxonomyTaxType>("GST");
  const [taxMode, setTaxMode] = useState<TaxMode>("inherit");
  const [overrideTaxRate, setOverrideTaxRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  function resetFormFields() {
    setName("");
    setStatus("Active");
    setImageFile(null);
    setCategoryTaxRate("0");
    setTaxType("GST");
    setTaxMode("inherit");
    setOverrideTaxRate("");
    setFormError(null);
  }

  function initInheritedTax(rate: number | null | undefined) {
    if (rate === null || rate === undefined) {
      setTaxMode("inherit");
      setOverrideTaxRate("");
      return;
    }
    setTaxMode("override");
    setOverrideTaxRate(String(rate));
  }

  function openCreateCategory() {
    resetFormFields();
    setFormMode({ kind: "create-category" });
  }

  function openEditCategory(row: AdminCategoryHierarchyRow) {
    resetFormFields();
    setName(row.category);
    setStatus(row.status);
    setCategoryTaxRate(String(row.categoryTaxRate ?? 0));
    setTaxType(row.categoryTaxType ?? "GST");
    setFormMode({
      kind: "edit-category",
      catId: row.catId,
      name: row.category,
      slug: row.categorySlug ?? previewTaxonomySlug(row.category),
      status: row.status,
      image: row.categoryImage,
      taxRate: row.categoryTaxRate ?? 0,
      taxType: row.categoryTaxType ?? "GST",
    });
  }

  function openCreateSubcategory(row: AdminCategoryHierarchyRow) {
    resetFormFields();
    setFormMode({
      kind: "create-subcategory",
      catId: row.catId,
      categoryName: row.category,
    });
  }

  function openEditSubcategory(row: AdminCategoryHierarchyRow) {
    if (!row.subId || row.subcategory === "—") return;
    resetFormFields();
    setName(row.subcategory);
    setTaxType(row.subcategoryTaxType ?? "GST");
    initInheritedTax(row.subcategoryTaxRate);
    setFormMode({
      kind: "edit-subcategory",
      subId: row.subId,
      catId: row.catId,
      categoryName: row.category,
      name: row.subcategory,
      slug: row.subcategorySlug ?? previewTaxonomySlug(row.subcategory),
      image: row.subcategoryImage ?? "",
      taxRate: row.subcategoryTaxRate ?? null,
      taxType: row.subcategoryTaxType ?? "GST",
    });
  }

  function openCreateChild(row: AdminCategoryHierarchyRow) {
    if (!row.subId || row.subcategory === "—") return;
    resetFormFields();
    setFormMode({
      kind: "create-child",
      catId: row.catId,
      categoryName: row.category,
      subId: row.subId,
      subcategoryName: row.subcategory,
    });
  }

  function openEditChild(row: AdminCategoryHierarchyRow) {
    if (!row.childId || !row.subId || row.child === "—") return;
    resetFormFields();
    setName(row.child);
    setTaxType(row.childTaxType ?? "GST");
    initInheritedTax(row.childTaxRate);
    setFormMode({
      kind: "edit-child",
      childId: row.childId,
      catId: row.catId,
      categoryName: row.category,
      subId: row.subId,
      subcategoryName: row.subcategory,
      name: row.child,
      slug: row.childSlug ?? previewTaxonomySlug(row.child),
      image: row.childImage ?? "",
      taxRate: row.childTaxRate ?? null,
      taxType: row.childTaxType ?? "GST",
    });
  }

  function closeForm() {
    setFormMode(null);
    resetFormFields();
  }

  async function save() {
    if (!formMode || !name.trim()) return;
    setFormError(null);

    const showInherited =
      formMode.kind === "create-subcategory" ||
      formMode.kind === "edit-subcategory" ||
      formMode.kind === "create-child" ||
      formMode.kind === "edit-child";

    let inheritedTax: number | null | undefined;
    if (showInherited) {
      const taxWrite = resolveTaxonomyTaxWrite(taxMode, overrideTaxRate);
      if (!taxWrite.ok) {
        setFormError(taxWrite.error);
        return;
      }
      inheritedTax = taxWrite.value;
    }

    setSaving(true);
    try {
      switch (formMode.kind) {
        case "create-category":
          await createAdminCategory({
            name: name.trim(),
            isActive: statusToIsActive(status),
            image: imageFile,
            taxRate: Number(categoryTaxRate) || 0,
            taxType,
          });
          break;
        case "edit-category":
          await updateAdminCategory(formMode.catId, {
            name: name.trim(),
            isActive: statusToIsActive(status),
            image: imageFile,
            taxRate: Number(categoryTaxRate) || 0,
            taxType,
          });
          break;
        case "create-subcategory":
          await createAdminSubcategory(formMode.catId, {
            name: name.trim(),
            image: imageFile,
            taxRate: inheritedTax,
            taxType,
          });
          break;
        case "edit-subcategory":
          await updateAdminSubcategory(formMode.subId, {
            name: name.trim(),
            image: imageFile,
            taxRate: inheritedTax,
            taxType,
          });
          break;
        case "create-child":
          await createAdminChildCategory(formMode.subId, {
            name: name.trim(),
            image: imageFile,
            taxRate: inheritedTax,
            taxType,
          });
          break;
        case "edit-child":
          await updateAdminChildCategory(formMode.childId, {
            name: name.trim(),
            image: imageFile,
            taxRate: inheritedTax,
            taxType,
          });
          break;
      }
      const wasCreate = formMode.kind.startsWith("create");
      closeForm();
      toast.success(wasCreate ? "Category level created" : "Category level saved");
      await hierarchyQuery.reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  async function removeLevel(
    level: "category" | "subcategory" | "child",
    id: string,
    label: string,
  ) {
    if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return;
    try {
      if (level === "category") await deleteAdminCategory(id);
      else if (level === "subcategory") await deleteAdminSubcategory(id);
      else await deleteAdminChildCategory(id);
      toast.success("Category level deleted");
      await hierarchyQuery.reload();
    } catch (err) {
      toast.error(toastMessageFromUnknown(err, "Unable to delete."));
    }
  }

  function applySearch() {
    setPage(1);
    setSearch(searchInput.trim());
  }

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setSortBy("sortOrder");
    setSortOrder("asc");
    setPage(1);
  }

  const showStatusField =
    formMode?.kind === "create-category" || formMode?.kind === "edit-category";
  const showCategoryTaxField = showStatusField;
  const showInheritedTaxField =
    formMode?.kind === "create-subcategory" ||
    formMode?.kind === "edit-subcategory" ||
    formMode?.kind === "create-child" ||
    formMode?.kind === "edit-child";

  const parentLabel = (() => {
    if (!formMode) return null;
    if (formMode.kind === "create-subcategory" || formMode.kind === "edit-subcategory") {
      return formMode.categoryName;
    }
    if (formMode.kind === "create-child" || formMode.kind === "edit-child") {
      return `${formMode.categoryName} → ${formMode.subcategoryName}`;
    }
    return null;
  })();

  const currentImage =
    formMode && "image" in formMode && formMode.image ? formMode.image : null;

  const slugPreview = previewTaxonomySlug(name);
  const existingSlug =
    formMode && "slug" in formMode && formMode.slug ? formMode.slug : "";
  const nameUnchanged =
    formMode && "name" in formMode ? name.trim() === formMode.name : false;
  const displayedSlug =
    formMode && (formMode.kind.startsWith("edit-") && nameUnchanged && existingSlug)
      ? existingSlug
      : slugPreview || "—";
  const slugHint =
    formMode && formMode.kind.startsWith("edit-") && nameUnchanged
      ? "URL slug for this category. Changing the name updates the slug automatically."
      : "URL slug generated from the name (lowercase letters, numbers, hyphens).";

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Manage category, subcategory, and child category hierarchy."
        action={<Button onClick={openCreateCategory}>Add Category</Button>}
      />

      <Card className="mb-4 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" htmlFor="cat-search">
            <Input
              id="cat-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
              placeholder="Search category name"
            />
          </Field>
          <Field label="Sort by" htmlFor="cat-sort-by">
            <Select
              id="cat-sort-by"
              value={sortBy}
              onChange={(e) => {
                setPage(1);
                setSortBy(e.target.value);
              }}
            >
              <option value="sortOrder">Order</option>
              <option value="name">Name</option>
              <option value="createdAt">Created</option>
            </Select>
          </Field>
          <Field label="Direction" htmlFor="cat-sort-dir">
            <Select
              id="cat-sort-dir"
              value={sortOrder}
              onChange={(e) => {
                setPage(1);
                setSortOrder(e.target.value as "asc" | "desc");
              }}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={applySearch}>
              Apply search
            </Button>
            <Button type="button" variant="secondary" className="flex-1" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {formMode ? (
        <Card className="mb-4 p-4">
          <p className="text-sm font-semibold">{formTitle(formMode)}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="tax-name">
              <Input
                id="tax-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Slug" htmlFor="tax-slug">
              <Input
                id="tax-slug"
                value={displayedSlug}
                readOnly
                disabled
                className="font-mono text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">{slugHint}</p>
            </Field>
            {parentLabel ? (
              <Field label="Parent" htmlFor="tax-parent">
                <Input id="tax-parent" value={parentLabel} readOnly disabled />
              </Field>
            ) : null}
            <Field label="Image" htmlFor="tax-image">
              <Input
                id="tax-image"
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
              {currentImage && !imageFile ? (
                <div className="relative mt-2 h-14 w-14 overflow-hidden rounded-[var(--radius-sm)] bg-muted">
                  <Image
                    src={currentImage}
                    alt="Current"
                    fill
                    className="object-cover"
                    sizes="56px"
                    unoptimized={isRemoteSrc(currentImage)}
                  />
                </div>
              ) : null}
            </Field>
            {showStatusField ? (
              <Field label="Status" htmlFor="cat-status">
                <Select
                  id="cat-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EntityStatus)}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </Select>
              </Field>
            ) : null}
            <Field label="Tax type" htmlFor="tax-type">
              <Select
                id="tax-type"
                value={taxType}
                onChange={(e) => setTaxType(e.target.value as TaxonomyTaxType)}
              >
                <option value="GST">GST</option>
                <option value="VAT">VAT</option>
                <option value="NONE">NONE</option>
              </Select>
            </Field>
            {showCategoryTaxField ? (
              <Field label="Tax Rate (%)" htmlFor="cat-tax-rate">
                <Input
                  id="cat-tax-rate"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={categoryTaxRate}
                  onChange={(e) => setCategoryTaxRate(e.target.value)}
                />
              </Field>
            ) : null}
            {showInheritedTaxField ? (
              <>
                <Field label="Tax Rate" htmlFor="tax-mode">
                  <Select
                    id="tax-mode"
                    value={taxMode}
                    onChange={(e) => setTaxMode(e.target.value as TaxMode)}
                  >
                    <option value="inherit">Inherit from parent</option>
                    <option value="override">Override</option>
                  </Select>
                </Field>
                {taxMode === "override" ? (
                  <Field label="Tax Rate (%)" htmlFor="tax-override-rate">
                    <Input
                      id="tax-override-rate"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={overrideTaxRate}
                      onChange={(e) => setOverrideTaxRate(e.target.value)}
                      placeholder="Including 0 for explicit 0%"
                    />
                  </Field>
                ) : null}
              </>
            ) : null}
          </div>
          {formError ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void save()} disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {hierarchyQuery.loading ? (
        <Card>
          <LoadingState message="Loading categories…" />
        </Card>
      ) : hierarchyQuery.error ? (
        <Card>
          <ErrorState
            message={hierarchyQuery.error}
            onRetry={() => void hierarchyQuery.reload()}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState message="No categories found." />
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Cat. tax</th>
                <th className="px-4 py-3 font-semibold">Subcategory</th>
                <th className="px-4 py-3 font-semibold">Sub tax</th>
                <th className="px-4 py-3 font-semibold">Child Category</th>
                <th className="px-4 py-3 font-semibold">Child tax</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="w-[1%] whitespace-nowrap px-4 py-3 text-right font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const rowKey = `${row.catId}-${row.subId ?? "s"}-${row.childId ?? "c"}-${index}`;
                return (
                  <tr key={rowKey} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 align-middle">
                      {thumb(row.categoryImage, row.category)}
                    </td>
                    <td className="px-4 py-3 align-middle text-muted-foreground">
                      {formatTaxonomyTaxLabel(row.categoryTaxRate, true)}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {hasSubcategory(row)
                        ? thumb(row.subcategoryImage, row.subcategory)
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 align-middle text-muted-foreground">
                      {formatTaxonomyTaxLabel(row.subcategoryTaxRate, hasSubcategory(row))}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {hasChildCategory(row)
                        ? thumb(row.childImage, row.child)
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 align-middle text-muted-foreground">
                      {formatTaxonomyTaxLabel(row.childTaxRate, hasChildCategory(row))}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <StatusBadge status={row.status} kind="entity" />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle">
                      <HierarchyRowActions
                        row={row}
                        menuOpen={openMenuKey === rowKey}
                        onMenuOpenChange={(open) => setOpenMenuKey(open ? rowKey : null)}
                        onEditCategory={() => openEditCategory(row)}
                        onEditSubcategory={() => openEditSubcategory(row)}
                        onEditChild={() => openEditChild(row)}
                        onAddSubcategory={() => openCreateSubcategory(row)}
                        onAddChild={() => openCreateChild(row)}
                        onDeleteCategory={() =>
                          void removeLevel("category", row.catId, row.category)
                        }
                        onDeleteSubcategory={() => {
                          if (!row.subId) return;
                          void removeLevel("subcategory", row.subId, row.subcategory);
                        }}
                        onDeleteChild={() => {
                          if (!row.childId) return;
                          void removeLevel("child", row.childId, row.child);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          {pagination && pagination.pages > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.pages} · {pagination.total} categories
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
