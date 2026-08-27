"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useShopperAuth } from "@/lib/auth/shopper-provider";
import { Field, PasswordInput, TextInput } from "@/components/checkout/checkout-field";
import { getGoogleClientId, isGoogleAuthConfigured } from "@/lib/api/shopper-auth";
import { cn } from "@/lib/cn";

type Mode =
  | "login"
  | "register"
  | "verify"
  | "forgot"
  | "reset"
  | "google-link";

interface ShopperAuthPanelProps {
  title?: string;
  description?: string;
  onAuthenticated?: () => void;
  /** When true, opens on register (e.g. checkout guest path). Default: login. */
  initialMode?: "login" | "register";
}

type GoogleCredentialResponse = { credential?: string };

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme?: string;
      size?: string;
      width?: number;
      text?: string;
      shape?: string;
    },
  ) => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/**
 * Reuses the existing shopper login + email OTP registration + Google contracts.
 * Google CTA is always visible; GIS mounts when NEXT_PUBLIC_GOOGLE_CLIENT_ID is set.
 */
export function ShopperAuthPanel({
  title = "Welcome back",
  description,
  onAuthenticated,
  initialMode = "login",
}: ShopperAuthPanelProps) {
  const {
    login,
    register,
    verifyRegistration,
    resendRegistrationCode,
    sendResetOtp,
    resetPassword,
    loginWithGoogleIdToken,
    linkGoogleWithPassword,
  } = useShopperAuth();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pendingGoogleIdToken, setPendingGoogleIdToken] = useState("");
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleReady = isGoogleAuthConfigured();

  async function finishLogin(nextIdentifier: string, nextPassword: string) {
    const result = await login({ identifier: nextIdentifier, password: nextPassword });
    if (!result.ok) {
      setError(result.error);
      toast.error("Sign in failed", result.error);
      return false;
    }
    toast.success("Signed in");
    onAuthenticated?.();
    return true;
  }

  const handleGoogleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      const idToken = response.credential?.trim();
      if (!idToken) {
        setError("Google did not return a sign-in credential.");
        toast.error("Google sign-in failed", "No credential returned.");
        return;
      }
      setGooglePending(true);
      setError(null);
      const result = await loginWithGoogleIdToken(idToken);
      setGooglePending(false);
      if ("linkRequired" in result && result.linkRequired) {
        setPendingGoogleIdToken(idToken);
        setEmail(result.email);
        setPassword("");
        setMode("google-link");
        setNotice(
          result.message ||
            `An account already exists for ${result.email}. Enter your password to link Google.`,
        );
        toast.info("Confirm your password to link Google");
        return;
      }
      if (!result.ok) {
        const message = "error" in result ? result.error : "Unable to sign in with Google.";
        setError(message);
        toast.error("Google sign-in failed", message);
        return;
      }
      toast.success("Signed in with Google");
      onAuthenticated?.();
    },
    [loginWithGoogleIdToken, onAuthenticated, toast],
  );

  useEffect(() => {
    if (!googleReady || (mode !== "login" && mode !== "register")) return;
    const clientId = getGoogleClientId();
    let cancelled = false;

    function mountButton() {
      if (cancelled || !googleButtonRef.current || !window.google?.accounts?.id) return;
      googleButtonRef.current.innerHTML = "";
      const width = Math.min(360, Math.max(280, googleButtonRef.current.offsetWidth || 320));
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          void handleGoogleCredential(response);
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width,
        text: "continue_with",
        shape: "rectangular",
      });
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-aaurikaa-google-gis="1"]',
    );
    if (window.google?.accounts?.id) {
      mountButton();
      return () => {
        cancelled = true;
      };
    }

    const script =
      existing ??
      (() => {
        const el = document.createElement("script");
        el.src = "https://accounts.google.com/gsi/client";
        el.async = true;
        el.dataset.aaurikaaGoogleGis = "1";
        document.head.appendChild(el);
        return el;
      })();

    script.addEventListener("load", mountButton);
    if (window.google?.accounts?.id) mountButton();

    return () => {
      cancelled = true;
      script.removeEventListener("load", mountButton);
    };
  }, [googleReady, mode, handleGoogleCredential]);

  function onGoogleUnavailable() {
    const message =
      "Google Sign-In is not configured for this environment. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID (and backend GOOGLE_CLIENT_ID).";
    setError(message);
    toast.info("Google Sign-In unavailable", message);
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    await finishLogin(identifier, password);
    setPending(false);
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await register({
      firstName,
      lastName,
      username,
      email,
      phone,
      password,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      toast.error("Registration failed", result.error);
      return;
    }
    setNotice(`A verification code was sent to ${result.email}.`);
    toast.success("Verification code sent", result.email);
    setMode("verify");
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const verified = await verifyRegistration({
      firstName,
      lastName,
      username,
      email,
      phone,
      password,
      otp,
    });
    if (!verified.ok) {
      setPending(false);
      setError(verified.error);
      toast.error("Verification failed", verified.error);
      return;
    }
    const signedIn = await finishLogin(email, password);
    setPending(false);
    if (!signedIn) {
      setMode("login");
      setIdentifier(email);
      setNotice("Account verified. Please sign in.");
    }
  }

  async function onResendRegistrationOtp() {
    setPending(true);
    setError(null);
    const result = await resendRegistrationCode({
      email,
      firstName,
      lastName,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      toast.error("Could not resend code", result.error);
      return;
    }
    setNotice(`A new verification code was sent to ${result.email}.`);
    toast.success("Code resent", result.email);
  }

  async function sendResetCode() {
    setPending(true);
    setError(null);
    const result = await sendResetOtp(email);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      toast.error("Could not send reset code", result.error);
      return false;
    }
    setNotice(`A reset code was sent to ${email.trim()}.`);
    toast.success("Reset code sent");
    return true;
  }

  async function onForgotSend(e: FormEvent) {
    e.preventDefault();
    const ok = await sendResetCode();
    if (ok) setMode("reset");
  }

  async function onResetPassword(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await resetPassword({
      email,
      otp,
      newPassword,
      confirmPassword,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      toast.error("Password reset failed", result.error);
      return;
    }
    setNotice("Password updated. Sign in with your new password.");
    toast.success("Password updated");
    setPassword("");
    setMode("login");
    setIdentifier(email);
  }

  async function onGoogleLink(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await linkGoogleWithPassword({
      idToken: pendingGoogleIdToken,
      password,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      toast.error("Could not link Google", result.error);
      return;
    }
    toast.success("Google linked", "You are signed in.");
    onAuthenticated?.();
  }

  const showGoogle = mode === "login" || mode === "register";

  return (
    <div className="border border-border bg-surface px-6 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow mb-3">Account</p>
      <h2 className="font-serif text-3xl tracking-tight">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description ??
          "Sign in to your AAURIKAA account. New customers can create an account with email verification."}
      </p>

      {showGoogle ? (
        <div className="mt-8 space-y-3">
          {googleReady ? (
            <div className="relative">
              <div
                ref={googleButtonRef}
                className={cn(
                  "flex min-h-11 w-full justify-center overflow-hidden [&_iframe]:!w-full",
                  googlePending && "pointer-events-none opacity-60",
                )}
              />
              {googlePending ? (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface/70 text-sm text-muted-foreground">
                  <Spinner /> Signing in with Google…
                </div>
              ) : null}
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onGoogleUnavailable}
            >
              <GoogleMark className="h-4 w-4" />
              Continue with Google
            </Button>
          )}
          <div className="flex items-center gap-3 pt-1">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              or continue with email
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

      {notice ? (
        <p className="mt-5 rounded-control border border-border bg-muted/80 px-3 py-2.5 text-sm leading-relaxed">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-5 text-sm text-sale" role="alert">
          {error}
        </p>
      ) : null}

      {mode === "login" ? (
        <form onSubmit={onLogin} className="mt-6 space-y-4">
          <Field id="login-identifier" label="Email or username">
            <TextInput
              id="login-identifier"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </Field>
          <Field id="login-password" label="Password">
            <PasswordInput
              id="login-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={pending || googlePending}>
            {pending ? (
              <>
                <Spinner /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm">
            <button
              type="button"
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => {
                setMode("forgot");
                setEmail(identifier.includes("@") ? identifier : email);
                setError(null);
                setNotice(null);
              }}
            >
              Forgot password
            </button>
            <button
              type="button"
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => {
                setMode("register");
                setError(null);
                setNotice(null);
              }}
            >
              Create account
            </button>
          </div>
        </form>
      ) : null}

      {mode === "register" ? (
        <form onSubmit={onRegister} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="reg-first" label="First name">
              <TextInput
                id="reg-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </Field>
            <Field id="reg-last" label="Last name">
              <TextInput
                id="reg-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </Field>
          </div>
          <Field id="reg-username" label="Username">
            <TextInput
              id="reg-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </Field>
          <Field id="reg-email" label="Email" hint="OTP is sent to this address">
            <TextInput
              id="reg-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field id="reg-phone" label="Mobile">
            <TextInput
              id="reg-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </Field>
          <Field id="reg-password" label="Password">
            <PasswordInput
              id="reg-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={pending || googlePending}>
            {pending ? (
              <>
                <Spinner /> Sending code…
              </>
            ) : (
              "Send email OTP"
            )}
          </Button>
          <button
            type="button"
            className="block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => {
              setMode("login");
              setError(null);
              setNotice(null);
            }}
          >
            Already have an account
          </button>
        </form>
      ) : null}

      {mode === "verify" ? (
        <form onSubmit={onVerify} className="mt-6 space-y-4">
          <Field id="reg-otp" label="Email OTP">
            <TextInput
              id="reg-otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <Spinner /> Verifying…
              </>
            ) : (
              "Verify and continue"
            )}
          </Button>
          <button
            type="button"
            className="block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            disabled={pending}
            onClick={() => void onResendRegistrationOtp()}
          >
            Resend verification code
          </button>
        </form>
      ) : null}

      {mode === "forgot" ? (
        <form onSubmit={onForgotSend} className="mt-6 space-y-4">
          <Field id="forgot-email" label="Email" hint="We send a one-time reset code here">
            <TextInput
              id="forgot-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <Spinner /> Sending…
              </>
            ) : (
              "Send reset code"
            )}
          </Button>
          <button
            type="button"
            className="block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => {
              setMode("login");
              setError(null);
              setNotice(null);
            }}
          >
            Back to sign in
          </button>
        </form>
      ) : null}

      {mode === "reset" ? (
        <form onSubmit={onResetPassword} className="mt-6 space-y-4">
          <Field id="reset-otp" label="Reset code">
            <TextInput
              id="reset-otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
          </Field>
          <Field id="reset-new-password" label="New password">
            <PasswordInput
              id="reset-new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </Field>
          <Field id="reset-confirm-password" label="Confirm password">
            <PasswordInput
              id="reset-confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <Spinner /> Updating…
              </>
            ) : (
              "Update password"
            )}
          </Button>
          <button
            type="button"
            className="block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            disabled={pending}
            onClick={() => void sendResetCode()}
          >
            Resend reset code
          </button>
          <button
            type="button"
            className="block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            Back to sign in
          </button>
        </form>
      ) : null}

      {mode === "google-link" ? (
        <form onSubmit={onGoogleLink} className="mt-6 space-y-4">
          <Field id="google-link-email" label="Account email">
            <TextInput id="google-link-email" type="email" value={email} readOnly />
          </Field>
          <Field
            id="google-link-password"
            label="Password"
            hint="One-time verification to link Google — never silent"
          >
            <PasswordInput
              id="google-link-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <Spinner /> Linking…
              </>
            ) : (
              "Link Google and sign in"
            )}
          </Button>
          <button
            type="button"
            className="block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => {
              setMode("login");
              setPendingGoogleIdToken("");
              setError(null);
              setNotice(null);
            }}
          >
            Cancel
          </button>
        </form>
      ) : null}
    </div>
  );
}
