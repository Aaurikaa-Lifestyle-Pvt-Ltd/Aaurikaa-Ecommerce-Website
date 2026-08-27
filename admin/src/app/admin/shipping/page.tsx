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
import { ApiError } from "@/lib/api/errors";
import {
  createFreeShippingRule,
  fetchFreeShippingRules,
  updateFreeShippingRule,
  type AdminFreeShippingRule,
} from "@/lib/api/shipping";
import { toast } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";

type Draft = {
  name: string;
  minOrderAmountINR: string;
  active: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  minOrderAmountINR: "",
  active: true,
};

/**
 * Minimal Shipping Admin — free-shipping order threshold only.
 * No zones, slabs, or weight-class UI.
 */
export default function ShippingPage() {
  const rulesQuery = useAdminResource(() => fetchFreeShippingRules(), []);
  const rules = rulesQuery.data ?? [];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AdminFreeShippingRule | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openAdd() {
    setAdding(true);
    setEditing(null);
    setDraft({ ...EMPTY_DRAFT });
    setFormError(null);
  }

  function openEdit(rule: AdminFreeShippingRule) {
    setEditing(rule);
    setAdding(false);
    setDraft({
      name: rule.name,
      minOrderAmountINR:
        rule.minOrderAmountINR > 0 ? String(rule.minOrderAmountINR) : "",
      active: rule.active,
    });
    setFormError(null);
  }

  async function save() {
    const name = draft.name.trim();
    const amountRaw = draft.minOrderAmountINR.trim();
    if (!name) {
      setFormError("Name is required.");
      return;
    }
    if (!amountRaw) {
      setFormError("Free-shipping threshold (INR) is required.");
      return;
    }
    const minOrderAmountINR = Number(amountRaw);
    if (!Number.isFinite(minOrderAmountINR) || minOrderAmountINR < 0) {
      setFormError("Enter a valid threshold amount in INR.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateFreeShippingRule(editing.id, {
          name,
          minOrderAmountINR,
          active: draft.active,
        });
      } else {
        await createFreeShippingRule({
          name,
          minOrderAmountINR,
          active: draft.active,
        });
      }
      setAdding(false);
      setEditing(null);
      setDraft({ ...EMPTY_DRAFT });
      toast.success(editing ? "Shipping rule updated" : "Shipping rule created");
      await rulesQuery.reload();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Unable to save free-shipping rule.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Shipping"
        description="Configure free-shipping order thresholds. Other shipping setup is not managed on this page."
        action={<Button onClick={openAdd}>Add threshold</Button>}
      />

      {adding || editing ? (
        <Card className="mb-4 p-4">
          <p className="text-sm font-semibold">
            {editing ? "Edit free-shipping threshold" : "Add free-shipping threshold"}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="ship-name">
              <Input
                id="ship-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Free shipping over…"
              />
            </Field>
            <Field label="Min order amount (INR)" htmlFor="ship-min">
              <Input
                id="ship-min"
                type="number"
                min={0}
                step="1"
                value={draft.minOrderAmountINR}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, minOrderAmountINR: e.target.value }))
                }
                placeholder="Enter threshold"
              />
            </Field>
            <Field label="Status" htmlFor="ship-active">
              <Select
                id="ship-active"
                value={draft.active ? "Active" : "Inactive"}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, active: e.target.value === "Active" }))
                }
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
                setFormError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {rulesQuery.loading ? (
        <Card>
          <LoadingState message="Loading free-shipping rules…" />
        </Card>
      ) : rulesQuery.error ? (
        <Card>
          <ErrorState message={rulesQuery.error} onRetry={() => void rulesQuery.reload()} />
        </Card>
      ) : rules.length === 0 ? (
        <Card>
          <EmptyState message="No free-shipping thresholds yet. Add one when the client provides the amount." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
              >
                <div>
                  <p className="font-medium">{rule.name || "Untitled"}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    Free shipping from ₹{rule.minOrderAmountINR}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    status={rule.active ? "Active" : "Inactive"}
                    kind="entity"
                  />
                  <Button variant="secondary" size="sm" onClick={() => openEdit(rule)}>
                    Edit
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
