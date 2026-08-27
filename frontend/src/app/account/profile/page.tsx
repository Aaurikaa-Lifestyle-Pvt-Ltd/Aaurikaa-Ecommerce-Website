"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/checkout/checkout-field";
import { useShopperAuth } from "@/lib/auth/shopper-provider";
import { IconUser } from "@/components/ui/icons";

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
    setNotice("Your profile has been saved successfully.");
  }

  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs sm:p-8">
        <div className="mb-6 flex items-center gap-3 border-b border-border/70 pb-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-[#faf8f4] text-foreground">
            <IconUser className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              Personal Information
            </p>
            <h2 className="font-serif text-xl font-normal tracking-tight text-foreground sm:text-2xl">
              Profile Details
            </h2>
          </div>
        </div>

        {notice ? (
          <div className="mb-6 rounded-xl border border-[#c8e6c9] bg-[#edf7ed] p-4 text-sm text-[#2e7d32]">
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="mb-6 rounded-xl border border-[#ffcdd2] bg-[#fdeded] p-4 text-sm text-[#d32f2f]" role="alert">
            {error}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="profile-first" label="First name">
              <TextInput
                id="profile-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </Field>
            <Field id="profile-last" label="Last name">
              <TextInput
                id="profile-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </Field>
          </div>

          <Field id="profile-username" label="Username">
            <TextInput
              id="profile-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </Field>

          <Field id="profile-phone" label="Mobile number">
            <TextInput
              id="profile-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
            />
          </Field>

          {user?.email ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email address</label>
              <div className="rounded-control border border-border/80 bg-muted/40 px-3.5 py-2.5 text-sm text-muted-foreground">
                {user.email}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Email is linked to your shopper account and cannot be modified here.
              </p>
            </div>
          ) : null}

          <div className="pt-2">
            <Button type="submit" disabled={pending} className="px-6 py-2.5">
              {pending ? "Saving changes…" : "Save Profile"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

