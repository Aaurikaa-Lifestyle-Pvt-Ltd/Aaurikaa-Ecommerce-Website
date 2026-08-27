"use client";

import { useState } from "react";
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
  type PermissionDomain,
  type StaffUser,
} from "@/lib/api/staff";
import { ApiError } from "@/lib/api/errors";
import { toast, toastMessageFromUnknown } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";

export default function StaffPage() {
  const usersQuery = useAdminResource(() => fetchStaffUsers(), []);
  const catalogQuery = useAdminResource(() => fetchPermissionCatalog(), []);
  const [adding, setAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function togglePermission(key: string) {
    setPermissions((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  function openCreate() {
    setAdding(true);
    setEditingUser(null);
    setName("");
    setUsername("");
    setEmail("");
    setPassword("");
    setPermissions([]);
    setFormError(null);
  }

  function openEditPermissions(user: StaffUser) {
    if (user.isSuperAdmin) return;
    setEditingUser(user);
    setAdding(false);
    setPermissions([...(user.permissions ?? [])]);
    setFormError(null);
  }

  async function createUser() {
    setSaving(true);
    setFormError(null);
    try {
      await createStaffUser({ name, username, email, password, permissions });
      setAdding(false);
      setName("");
      setUsername("");
      setEmail("");
      setPassword("");
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
      await updateStaffUser(editingUser.id, { permissions });
      setEditingUser(null);
      setPermissions([]);
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

  const catalog = catalogQuery.data ?? [];

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
          </div>
          <PermissionPicker catalog={catalog} selected={permissions} onToggle={togglePermission} />
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
          <p className="text-sm font-semibold">Edit permissions — {editingUser.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{editingUser.email}</p>
          <PermissionPicker catalog={catalog} selected={permissions} onToggle={togglePermission} />
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void savePermissions()} disabled={saving}>
              {saving ? "Saving…" : "Save permissions"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setEditingUser(null);
                setPermissions([]);
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
              <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5">
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {user.email}
                    {user.isSuperAdmin ? " · Super Admin" : ""}
                    {user.isActive === false ? " · inactive" : ""}
                    {!user.isSuperAdmin && (user.permissions?.length ?? 0) > 0
                      ? ` · ${user.permissions!.length} permissions`
                      : ""}
                  </p>
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

function PermissionPicker({
  catalog,
  selected,
  onToggle,
}: {
  catalog: PermissionDomain[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      {catalog.map((domain) => (
        <div key={domain.id}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {domain.label}
          </p>
          <div className="mt-1 flex flex-wrap gap-3">
            {domain.actions.map((action) => {
              const key = `${domain.id}:${action.id}`;
              return (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(key)}
                    onChange={() => onToggle(key)}
                  />
                  {action.label}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
