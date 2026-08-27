"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  PasswordInput,
} from "@/components/ui";
import {
  createStaffUser,
  fetchPermissionCatalog,
  fetchStaffUsers,
  updateStaffUser,
  type PermissionCatalogForUi,
  type PermissionDomain,
  type PermissionUiGroup,
  type StaffUser,
} from "@/lib/api/staff";
import { ApiError } from "@/lib/api/errors";
import { formatPermissionKey } from "@/lib/admin-permissions";
import { toast, toastMessageFromUnknown } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";
import { cn } from "@/lib/cn";

export default function StaffPage() {
  const usersQuery = useAdminResource(() => fetchStaffUsers(), []);
  const catalogQuery = useAdminResource(() => fetchPermissionCatalog(), []);
  const [adding, setAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayLabel, setDisplayLabel] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const catalogData: PermissionCatalogForUi = catalogQuery.data ?? {
    catalog: [],
    groups: [],
    suggestedDisplayLabels: [],
  };

  function openCreate() {
    setAdding(true);
    setEditingUser(null);
    setName("");
    setUsername("");
    setEmail("");
    setPassword("");
    setDisplayLabel("");
    setPermissions([]);
    setFormError(null);
  }

  function openEditPermissions(user: StaffUser) {
    if (user.isSuperAdmin) return;
    setEditingUser(user);
    setAdding(false);
    setDisplayLabel(user.displayLabel ?? "");
    setPermissions([...(user.permissions ?? [])]);
    setFormError(null);
  }

  async function createUser() {
    setSaving(true);
    setFormError(null);
    try {
      await createStaffUser({
        name,
        username,
        email,
        password,
        permissions,
        displayLabel: displayLabel.trim() || undefined,
      });
      setAdding(false);
      setName("");
      setUsername("");
      setEmail("");
      setPassword("");
      setDisplayLabel("");
      setPermissions([]);
      toast.success("Staff user created");
      await usersQuery.reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unable to create staff user.");
    } finally {
      setSaving(false);
    }
  }

  async function savePermissions() {
    if (!editingUser) return;
    setSaving(true);
    setFormError(null);
    try {
      await updateStaffUser(editingUser.id, {
        permissions,
        displayLabel: displayLabel.trim() || null,
      });
      setEditingUser(null);
      setPermissions([]);
      setDisplayLabel("");
      toast.success("Permissions updated");
      await usersQuery.reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unable to update permissions.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: StaffUser) {
    if (user.isSuperAdmin) return;
    try {
      await updateStaffUser(user.id, { isActive: !user.isActive });
      toast.success(user.isActive === false ? "Staff user activated" : "Staff user deactivated");
      await usersQuery.reload();
    } catch (err) {
      toast.error(toastMessageFromUnknown(err, "Unable to update staff user."));
    }
  }

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Existing Admin RBAC. Seller and finance domains are hidden for AAURIKAA."
        action={<Button onClick={openCreate}>Add staff</Button>}
      />

      {formError ? (
        <p className="mb-4 text-sm text-danger" role="alert">
          {formError}
        </p>
      ) : null}

      {adding ? (
        <Card className="mb-4 p-4">
          <p className="text-sm font-semibold">New staff account</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="name">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Username" htmlFor="username">
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password">
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Role label (optional)" htmlFor="displayLabel">
              <Input
                id="displayLabel"
                list="staff-role-suggestions"
                value={displayLabel}
                onChange={(e) => setDisplayLabel(e.target.value)}
                placeholder="e.g. Catalog Manager"
              />
            </Field>
          </div>
          <RoleSuggestions labels={catalogData.suggestedDisplayLabels} />
          <PermissionPicker
            catalog={catalogData.catalog}
            groups={catalogData.groups}
            selected={permissions}
            onChange={setPermissions}
          />
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void createUser()} disabled={saving}>
              {saving ? "Saving…" : "Create"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {editingUser ? (
        <Card className="mb-4 p-4">
          <p className="text-sm font-semibold">Edit access — {editingUser.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{editingUser.email}</p>
          <div className="mt-3 max-w-md">
            <Field label="Role label (optional)" htmlFor="edit-displayLabel">
              <Input
                id="edit-displayLabel"
                list="staff-role-suggestions"
                value={displayLabel}
                onChange={(e) => setDisplayLabel(e.target.value)}
                placeholder="e.g. Support Staff"
              />
            </Field>
            <RoleSuggestions labels={catalogData.suggestedDisplayLabels} />
          </div>
          <PermissionPicker
            catalog={catalogData.catalog}
            groups={catalogData.groups}
            selected={permissions}
            onChange={setPermissions}
          />
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void savePermissions()} disabled={saving}>
              {saving ? "Saving…" : "Save permissions"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setEditingUser(null);
                setPermissions([]);
                setDisplayLabel("");
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {usersQuery.loading ? (
        <Card>
          <LoadingState message="Loading staff…" />
        </Card>
      ) : usersQuery.error ? (
        <Card>
          <ErrorState message={usersQuery.error} onRetry={() => void usersQuery.reload()} />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {(usersQuery.data ?? []).map((user) => (
              <li
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <RoleBadge user={user} />
                    <StatusPill active={user.isActive !== false} />
                    <AccessSummary user={user} />
                  </div>
                </div>
                {user.isSuperAdmin ? null : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openEditPermissions(user)}
                    >
                      Permissions
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => void toggleActive(user)}>
                      {user.isActive === false ? "Activate" : "Deactivate"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function RoleSuggestions({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <datalist id="staff-role-suggestions">
      {labels.map((label) => (
        <option key={label} value={label} />
      ))}
    </datalist>
  );
}

function RoleBadge({ user }: { user: StaffUser }) {
  const label = user.isSuperAdmin
    ? "Super Admin"
    : user.displayLabel?.trim() || "Staff";
  return (
    <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
      Role: {label}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold",
        active ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900",
      )}
    >
      Status: {active ? "Active" : "Inactive"}
    </span>
  );
}

function AccessSummary({ user }: { user: StaffUser }) {
  if (user.isSuperAdmin) {
    return (
      <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Access: Full
      </span>
    );
  }
  const count = user.permissions?.length ?? 0;
  return (
    <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Permissions: {count === 0 ? "None" : `${count} assigned`}
    </span>
  );
}

function PermissionPicker({
  catalog,
  groups,
  selected,
  onChange,
}: {
  catalog: PermissionDomain[];
  groups: PermissionUiGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const catalogById = useMemo(
    () => Object.fromEntries(catalog.map((domain) => [domain.id, domain])),
    [catalog],
  );

  if (catalog.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">Loading permissions…</p>;
  }

  if (groups.length > 0) {
    const groupedIds = new Set(groups.flatMap((g) => g.domains));
    const ungrouped = catalog.filter((d) => !groupedIds.has(d.id));

    return (
      <div className="mt-4 space-y-5">
        {groups.map((group) => {
          const domains = group.domains.map((id) => catalogById[id]).filter(Boolean);
          if (domains.length === 0) return null;
          return (
            <section key={group.id}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h3>
              <div className="mt-2 space-y-3">
                {domains.map((domain) => (
                  <DomainPermissionBlock
                    key={domain.id}
                    domain={domain}
                    selected={selected}
                    selectedSet={selectedSet}
                    onChange={onChange}
                  />
                ))}
              </div>
            </section>
          );
        })}
        {ungrouped.length > 0 ? (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Other
            </h3>
            <div className="mt-2 space-y-3">
              {ungrouped.map((domain) => (
                <DomainPermissionBlock
                  key={domain.id}
                  domain={domain}
                  selected={selected}
                  selectedSet={selectedSet}
                  onChange={onChange}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {catalog.map((domain) => (
        <DomainPermissionBlock
          key={domain.id}
          domain={domain}
          selected={selected}
          selectedSet={selectedSet}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function DomainPermissionBlock({
  domain,
  selected,
  selectedSet,
  onChange,
}: {
  domain: PermissionDomain;
  selected: string[];
  selectedSet: Set<string>;
  onChange: (next: string[]) => void;
}) {
  const keys = domain.actions.map((action) => formatPermissionKey(domain.id, action.id));
  const allSelected = keys.length > 0 && keys.every((key) => selectedSet.has(key));

  function togglePermission(key: string) {
    onChange(
      selectedSet.has(key) ? selected.filter((item) => item !== key) : [...selected, key],
    );
  }

  function toggleDomain() {
    onChange(
      allSelected
        ? selected.filter((item) => !keys.includes(item))
        : [...new Set([...selected, ...keys])],
    );
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{domain.label}</p>
        <button
          type="button"
          onClick={toggleDomain}
          className="shrink-0 text-xs font-medium text-accent hover:underline"
        >
          {allSelected ? "Clear all" : "Select all"}
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        {domain.actions.map((action) => {
          const key = formatPermissionKey(domain.id, action.id);
          return (
            <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedSet.has(key)}
                onChange={() => togglePermission(key)}
              />
              {action.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
