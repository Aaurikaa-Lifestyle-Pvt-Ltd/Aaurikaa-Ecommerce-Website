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
} from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { fetchAdminCoupons, saveAdminCoupon } from "@/lib/api/coupons";
import { ApiError } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";
import type { AdminCoupon, EntityStatus } from "@/types/admin";

export default function CouponsPage() {
  const couponsQuery = useAdminResource(() => fetchAdminCoupons(), []);
  const items = couponsQuery.data ?? [];
  const [editing, setEditing] = useState<AdminCoupon | null>(null);
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("");
  const [expiry, setExpiry] = useState("");
  const [status, setStatus] = useState<EntityStatus>("Active");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openAdd() {
    setAdding(true);
    setEditing(null);
    setCode("");
    setDiscount("");
    setExpiry("2026-12-31");
    setStatus("Active");
  }

  function openEdit(coupon: AdminCoupon) {
    setEditing(coupon);
    setAdding(false);
    setCode(coupon.code);
    setDiscount(coupon.discount);
    setExpiry(coupon.expiry);
    setStatus(coupon.status);
  }

  async function save() {
    if (!code.trim() || !discount.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      await saveAdminCoupon({
        id: editing?.id,
        code,
        discount,
        expiry,
        status,
      });
      setAdding(false);
      setEditing(null);
      toast.success(editing ? "Coupon updated" : "Coupon created");
      await couponsQuery.reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unable to save coupon.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Coupons"
        description="Promotion codes from the backend coupon engine (promotions permission required)."
        action={<Button onClick={openAdd}>Add Coupon</Button>}
      />

      {adding || editing ? (
        <Card className="mb-4 p-4">
          <p className="text-sm font-semibold">
            {editing ? "Edit Coupon" : "Add Coupon"}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Code" htmlFor="code">
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Field label="Discount" htmlFor="discount">
              <Input
                id="discount"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="10% or 500"
              />
            </Field>
            <Field label="Expiry" htmlFor="expiry">
              <Input
                id="expiry"
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </Field>
            <Field label="Status" htmlFor="status">
              <Select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as EntityStatus)}
              >
                <option>Active</option>
                <option>Inactive</option>
              </Select>
            </Field>
          </div>
          {formError ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
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

      {couponsQuery.loading ? (
        <Card>
          <LoadingState message="Loading coupons…" />
        </Card>
      ) : couponsQuery.error ? (
        <Card>
          <ErrorState message={couponsQuery.error} onRetry={() => void couponsQuery.reload()} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState message="No coupons yet." />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((coupon) => (
            <Card key={coupon.id} className="p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-base font-semibold">{coupon.code}</p>
                    <StatusBadge status={coupon.status} kind="entity" />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {coupon.discount}
                    {coupon.expiry ? ` · Expires ${formatDate(coupon.expiry)}` : ""}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => openEdit(coupon)}>
                  Edit
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
