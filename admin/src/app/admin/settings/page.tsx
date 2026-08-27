"use client";

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
  PasswordInput,
} from "@/components/ui";
import {
  changeAdminPassword,
  fetchAdminMe,
  updateAdminProfile,
} from "@/lib/api/admin-auth";
import { setAdminSession, getAdminToken, type AdminSessionUser } from "@/lib/api/token-store";
import { ApiError } from "@/lib/api/errors";
import { toast } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";

export default function SettingsPage() {
  const meQuery = useAdminResource(() => fetchAdminMe(), []);

  return (
    <div>
      <PageHeader
        title="Account"
        description="Your administrator profile, password, and security. Store website settings live under SEO and other dedicated hubs."
      />

      {meQuery.loading ? (
        <Card>
          <LoadingState message="Loading account…" />
        </Card>
      ) : meQuery.error ? (
        <Card>
          <ErrorState message={meQuery.error} onRetry={() => void meQuery.reload()} />
        </Card>
      ) : meQuery.data ? (
        <AccountForm
          user={meQuery.data}
          onReload={() => meQuery.reload()}
        />
      ) : null}
    </div>
  );
}

function AccountForm({
  user,
  onReload,
}: {
  user: AdminSessionUser;
  onReload: () => Promise<void>;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function saveProfile() {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateAdminProfile({
        name: name.trim(),
        email: email.trim(),
        username: username.trim() || undefined,
      });
      const token = getAdminToken();
      if (token) {
        setAdminSession(token, { ...user, ...updated, name: updated.name || name });
      }
      toast.success("Profile saved");
      await onReload();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  }

  async function savePassword() {
    if (!oldPassword || !newPassword) {
      setPasswordError("Current and new passwords are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      await changeAdminPassword({ oldPassword, newPassword });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Unable to change password.");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Profile" description="GET/PUT /api/admin/me and /api/admin/update." />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Name" htmlFor="admin-name">
            <Input id="admin-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Username" htmlFor="admin-username">
            <Input
              id="admin-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Email" htmlFor="admin-email" className="sm:col-span-2">
            <Input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {user.isSuperAdmin ? (
            <p className="sm:col-span-2 text-sm text-muted-foreground">
              Super Admin account — full access.
            </p>
          ) : null}
          {saveError ? (
            <p className="sm:col-span-2 text-sm text-danger" role="alert">
              {saveError}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button onClick={() => void saveProfile()} disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Password & security"
          description="PUT /api/admin/change-password. Use a strong unique password."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Current password" htmlFor="old-password" className="sm:col-span-2">
            <PasswordInput
              id="old-password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
          </Field>
          <Field label="New password" htmlFor="new-password">
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-password">
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Field>
          {passwordError ? (
            <p className="sm:col-span-2 text-sm text-danger" role="alert">
              {passwordError}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button onClick={() => void savePassword()} disabled={passwordSaving}>
              {passwordSaving ? "Updating…" : "Change password"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
