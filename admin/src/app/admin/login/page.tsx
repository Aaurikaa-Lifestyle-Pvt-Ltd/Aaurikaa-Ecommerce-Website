"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const { login, configured } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    const result = await login(email, password);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.replace("/admin");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 20% 0%, rgba(13,148,136,0.18), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(15,23,42,0.12), transparent 50%), linear-gradient(180deg, #eef2f6 0%, #f4f5f7 100%)",
        }}
      />
      <div className="relative w-full max-w-[400px] animate-rise-in">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            AAURIKAA
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            Admin
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with your operations console account.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6"
        >
          <div className="space-y-4">
            <Field label="Email or username" htmlFor="email">
              <Input
                id="email"
                type="text"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
          </div>

          {error ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {!configured ? (
            <p className="mt-3 text-sm text-muted-foreground" role="status">
              Set NEXT_PUBLIC_API_BASE_URL to connect this console to the backend.
            </p>
          ) : null}

          <Button type="submit" className="mt-5 w-full" size="lg" disabled={pending || !configured}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
