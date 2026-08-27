"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  PasswordInput,
} from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
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
import {
  mergePreservedHiddenPermissions,
  staffIsActive,
  staffRoleLabel,
  summarizeStaffAccess,
  visibleStaffPermissionKeys,
} from "@/lib/staff-presentation";
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

  const users = usersQuery.data ?? [];

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
    setPermissions(visibleStaffPermissionKeys(user.permissions));
    setFormError(null);
  }

  function closeForms() {
    setAdding(false);
    setEditingUser(null);
    setPermissions([]);
    setDisplayLabel("");
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
        permissions: visibleStaffPermissionKeys(permissions),
        displayLabel: displayLabel.trim() || undefined,
      });
      closeForms();
      setName("");
      setUsername("");
      setEmail("");
      setPassword("");
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
        permissions: mergePreservedHiddenPermissions(permissions, editingUser.permissions),
        displayLabel: displayLabel.trim() || null,
      });
      closeForms();
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
      await updateStaffUser(user.id, { isActive: !staffIsActive(user) });
      toast.success(staffIsActive(user) ? "Staff user deactivated" : "Staff user activated");
      await usersQuery.reload();
    } catch (err) {
      toast.error(toastMessageFromUnknown(err, "Unable to update staff user."));
    }
  }

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Manage Admin accounts, roles, and access. Super Admin retains full control."
        action={<Button onClick={openCreate}>Add staff</Button>}
      />

      {formError ? (
        <p className="mb-4 text-sm text-danger" role="alert">
          {formError}
        </p>
      ) : null}

      {adding ? (
        <Card className="mb-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">New staff account</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Assign a role label and the permissions this person needs.
              </p>
            </div>
            <StatusBadge status="Active" kind="entity" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
            <Field label="Role label (optional)" htmlFor="displayLabel" className="sm:col-span-2">
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
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void createUser()} disabled={saving}>
              {saving ? "Saving…" : "Create"}
            </Button>
            <Button variant="secondary" onClick={closeForms}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {editingUser ? (
        <Card className="mb-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Edit access — {editingUser.name}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{editingUser.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <RoleBadge label={staffRoleLabel(editingUser)} />
                <StatusBadge
                  status={staffIsActive(editingUser) ? "Active" : "Inactive"}
                  kind="entity"
                />
              </div>
            </div>
          </div>
          <div className="mt-4 max-w-lg">
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
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void savePermissions()} disabled={saving}>
              {saving ? "Saving…" : "Save permissions"}
            </Button>
            <Button variant="secondary" onClick={closeForms}>
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
      ) : users.length === 0 ? (
        <Card>
          <EmptyState message="No staff accounts yet. Add a staff member to get started." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {users.map((user) => {
              const active = staffIsActive(user);
              return (
                <li
                  key={user.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="font-medium text-foreground">{user.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                      {user.username ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">@{user.username}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <RoleBadge label={staffRoleLabel(user)} emphasis={user.isSuperAdmin} />
                      <StatusBadge status={active ? "Active" : "Inactive"} kind="entity" />
                    </div>
                    <AccessSummary user={user} catalog={catalogData.catalog} />
                  </div>
                  {user.isSuperAdmin ? (
                    <p className="shrink-0 text-xs text-muted-foreground sm:pt-1 sm:text-right">
                      Full access · not editable
                    </p>
                  ) : (
                    <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openEditPermissions(user)}
                      >
                        Permissions
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => void toggleActive(user)}>
                        {active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
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

function RoleBadge({ label, emphasis }: { label: string; emphasis?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
        emphasis
          ? "border-foreground/15 bg-foreground text-background"
          : "border-border bg-muted text-foreground",
      )}
    >
      {label}
    </span>
  );
}

function AccessSummary({
  user,
  catalog,
}: {
  user: StaffUser;
  catalog: PermissionDomain[];
}) {
  const summary = useMemo(
    () => summarizeStaffAccess(user, catalog, { maxDomains: 4 }),
    [user, catalog],
  );

  if (summary.kind === "full") {
    return (
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground/80">Access:</span> Full platform access
      </p>
    );
  }

  if (summary.kind === "none") {
    return (
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground/80">Access:</span> No permissions assigned
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Access</p>
      <ul className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-1.5">
        {summary.lines.map((line) => (
          <li
            key={line}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground sm:max-w-full"
          >
            {line}
          </li>
        ))}
        {summary.remainingDomains > 0 ? (
          <li className="px-1 py-1 text-xs text-muted-foreground">
            +{summary.remainingDomains} more
          </li>
        ) : null}
      </ul>
    </div>
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

  const totalAssignable = useMemo(
    () => catalog.reduce((sum, domain) => sum + domain.actions.length, 0),
    [catalog],
  );

  if (catalog.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">Loading permissions…</p>;
  }

  const header = (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <p className="text-sm font-semibold text-foreground">Permissions</p>
        <p className="text-xs text-muted-foreground">
          Grouped by Admin module. Enabled items grant access for this account.
        </p>
      </div>
      <p className="text-xs font-medium tabular-nums text-muted-foreground">
        {selected.length} of {totalAssignable} enabled
      </p>
    </div>
  );

  if (groups.length > 0) {
    const groupedIds = new Set(groups.flatMap((g) => g.domains));
    const ungrouped = catalog.filter((d) => !groupedIds.has(d.id));

    return (
      <div className="mt-5">
        {header}
        <div className="space-y-5">
          {groups.map((group) => {
            const domains = group.domains.map((id) => catalogById[id]).filter(Boolean);
            if (domains.length === 0) return null;
            return (
              <section key={group.id}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
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
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Other
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
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
      </div>
    );
  }

  return (
    <div className="mt-5">
      {header}
      <div className="grid gap-3 md:grid-cols-2">
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
  const selectedCount = keys.filter((key) => selectedSet.has(key)).length;
  const allSelected = keys.length > 0 && selectedCount === keys.length;

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
    <div
      className={cn(
        "rounded-[var(--radius-sm)] border bg-surface px-3 py-3",
        selectedCount > 0 ? "border-accent/30" : "border-border",
      )}
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{domain.label}</p>
          <p className="text-xs text-muted-foreground">
            {selectedCount === 0
              ? "None enabled"
              : `${selectedCount} of ${keys.length} enabled`}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleDomain}
          className="shrink-0 text-xs font-medium text-accent hover:underline"
        >
          {allSelected ? "Clear" : "Select all"}
        </button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {domain.actions.map((action) => {
          const key = formatPermissionKey(domain.id, action.id);
          const checked = selectedSet.has(key);
          return (
            <label
              key={key}
              className={cn(
                "flex cursor-pointer items-center gap-2 text-sm",
                checked ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => togglePermission(key)}
                className="size-3.5 accent-[var(--accent)]"
              />
              <span>{action.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
