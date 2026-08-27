"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499A10.75 10.75 0 0 1 2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.146-4.99" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export default function LoginPage() {
  const { login, configured } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#faf8f5] px-4 py-12 text-[#1a1714]">
      {/* Warm ambient background aura */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 75% 55% at 50% -10%, rgba(166, 135, 92, 0.14), transparent 60%),
            radial-gradient(ellipse 60% 45% at 100% 100%, rgba(166, 135, 92, 0.08), transparent 50%),
            radial-gradient(ellipse 50% 40% at 0% 100%, rgba(26, 23, 20, 0.04), transparent 50%),
            linear-gradient(180deg, #faf8f5 0%, #f4efe6 100%)
          `,
        }}
      />

      <div className="relative w-full max-w-[420px] animate-rise-in">
        {/* AAURIKAA Brand Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl border border-[#e8e1d5] bg-white p-3 shadow-[0_2px_12px_-2px_rgba(26,23,20,0.06)]">
            <Image
              src="/images/logo/aaurikaa-emblem.png"
              alt="AAURIKAA"
              width={48}
              height={48}
              className="h-auto w-auto object-contain"
              priority
            />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9b7b4d]">
            Operations Console
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#1a1714] sm:text-3xl">
            AAURIKAA Admin
          </h1>
          <p className="mt-1.5 text-xs text-[#787167] sm:text-sm">
            Sign in with your operations console account.
          </p>
        </div>

        {/* Refined Login Card */}
        <div className="rounded-2xl border border-[#e8e1d5] bg-white p-6 shadow-[0_8px_30px_-6px_rgba(26,23,20,0.08),0_2px_6px_rgba(26,23,20,0.04)] sm:p-8">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#6e675c]"
              >
                Email or username
              </label>
              <input
                id="email"
                type="text"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@aaurikaa.com"
                required
                className="h-11 w-full rounded-lg border border-[#dcd5c9] bg-[#fdfcfb] px-3.5 text-sm text-[#1a1714] outline-none transition placeholder:text-[#a8a195] focus:border-[#a6875c] focus:bg-white focus:ring-2 focus:ring-[#a6875c]/20"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#6e675c]"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-11 w-full rounded-lg border border-[#dcd5c9] bg-[#fdfcfb] pl-3.5 pr-10 text-sm text-[#1a1714] outline-none transition placeholder:text-[#a8a195] focus:border-[#a6875c] focus:bg-white focus:ring-2 focus:ring-[#a6875c]/20"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-0 top-0 flex h-11 w-10 items-center justify-center text-[#8c8477] transition-colors hover:text-[#1a1714] focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOffIcon className="size-4.5" />
                  ) : (
                    <EyeIcon className="size-4.5" />
                  )}
                </button>
              </div>
            </div>

            {error ? (
              <div
                className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50/80 p-3 text-xs text-red-700"
                role="alert"
              >
                <svg
                  className="size-4 shrink-0 text-red-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="leading-snug">{error}</span>
              </div>
            ) : null}

            {!configured ? (
              <div
                className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs leading-relaxed text-amber-800"
                role="status"
              >
                Set NEXT_PUBLIC_API_BASE_URL to connect this console to the backend.
              </div>
            ) : null}

            <button
              type="submit"
              disabled={pending || !configured}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#1a1714] px-4 text-sm font-medium text-[#fbfaf8] shadow-sm transition-all hover:bg-[#2e2924] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
            >
              {pending ? (
                <>
                  <svg
                    className="size-4 animate-spin text-[#dcd5c9]"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Signing in…</span>
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        {/* Security / Organization Footer */}
        <p className="mt-6 text-center text-[11px] tracking-wide text-[#948c80]">
          AAURIKAA Lifestyle Pvt. Ltd. · Restricted Access
        </p>
      </div>
    </div>
  );
}
