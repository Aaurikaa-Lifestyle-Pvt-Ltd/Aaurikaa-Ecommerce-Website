"use client";

import { useEffect, useState } from "react";
import { Field, Select } from "@/components/ui";
import {
  fetchAdminChildCategories,
  fetchAdminSubcategories,
  type TaxonomyOption,
} from "@/lib/api/categories";
import type { AdminCategory } from "@/types/admin";

export function CategoryTaxonomyFields({
  categories,
  categoryId,
  subcategoryId,
  childCategoryId,
  onCategoryChange,
  onSubcategoryChange,
  onChildCategoryChange,
}: {
  categories: AdminCategory[];
  categoryId: string;
  subcategoryId: string;
  childCategoryId: string;
  onCategoryChange: (id: string) => void;
  onSubcategoryChange: (id: string) => void;
  onChildCategoryChange: (id: string) => void;
}) {
  const [subs, setSubs] = useState<TaxonomyOption[]>([]);
  const [children, setChildren] = useState<TaxonomyOption[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [loadingChildren, setLoadingChildren] = useState(false);

  useEffect(() => {
    if (!categoryId) {
      setSubs([]);
      return;
    }
    let cancelled = false;
    setLoadingSubs(true);
    void fetchAdminSubcategories(categoryId)
      .then((rows) => {
        if (!cancelled) setSubs(rows);
      })
      .catch(() => {
        if (!cancelled) setSubs([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSubs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  useEffect(() => {
    if (!subcategoryId) {
      setChildren([]);
      return;
    }
    let cancelled = false;
    setLoadingChildren(true);
    void fetchAdminChildCategories(subcategoryId)
      .then((rows) => {
        if (!cancelled) setChildren(rows);
      })
      .catch(() => {
        if (!cancelled) setChildren([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingChildren(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subcategoryId]);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Category" htmlFor="product-category">
        <Select
          id="product-category"
          value={categoryId}
          onChange={(e) => {
            onCategoryChange(e.target.value);
            onSubcategoryChange("");
            onChildCategoryChange("");
          }}
        >
          <option value="">Select category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Subcategory" htmlFor="product-subcategory">
        <Select
          id="product-subcategory"
          value={subcategoryId}
          disabled={!categoryId || loadingSubs}
          onChange={(e) => {
            onSubcategoryChange(e.target.value);
            onChildCategoryChange("");
          }}
        >
          <option value="">{loadingSubs ? "Loading…" : "Select subcategory"}</option>
          {subs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Child Category" htmlFor="product-child">
        <Select
          id="product-child"
          value={childCategoryId}
          disabled={!subcategoryId || loadingChildren}
          onChange={(e) => onChildCategoryChange(e.target.value)}
        >
          <option value="">{loadingChildren ? "Loading…" : "Select child category"}</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
