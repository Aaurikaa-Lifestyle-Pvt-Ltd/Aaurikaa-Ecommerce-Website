"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/checkout/checkout-field";
import { useShopperAuth } from "@/lib/auth/shopper-provider";

export default function ProfilePage() {
  const { user, updateProfile } = useShopperAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await updateProfile({ firstName, lastName, username, phone });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice("Profile saved.");
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4">
      <h2 className="font-serif text-2xl tracking-tight">Profile</h2>
      {notice ? <p className="text-sm">{notice}</p> : null}
      {error ? (
        <p className="text-sm text-sale" role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="profile-first" label="First name">
          <TextInput id="profile-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </Field>
        <Field id="profile-last" label="Last name">
          <TextInput id="profile-last" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </Field>
      </div>
      <Field id="profile-username" label="Username">
        <TextInput id="profile-username" value={username} onChange={(e) => setUsername(e.target.value)} required />
      </Field>
      <Field id="profile-phone" label="Mobile">
        <TextInput id="profile-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <p className="text-xs text-muted-foreground">Email is managed by the shopper account and is not editable here.</p>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
