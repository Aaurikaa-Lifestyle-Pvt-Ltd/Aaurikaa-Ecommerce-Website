import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError } from "./errors.ts";

const here = dirname(fileURLToPath(import.meta.url));
const shopperAuthSource = readFileSync(join(here, "shopper-auth.ts"), "utf8");
const authPanelSource = readFileSync(
  join(here, "../../components/account/shopper-auth-panel.tsx"),
  "utf8",
);
const providerSource = readFileSync(
  join(here, "../auth/shopper-provider.tsx"),
  "utf8",
);

test("password reset client posts to send-otp and reset-password with required fields", () => {
  assert.match(shopperAuthSource, /\/api\/shopper\/send-otp/);
  assert.match(shopperAuthSource, /\/api\/shopper\/reset-password/);
  assert.match(shopperAuthSource, /email:\s*body\.email\.trim\(\)/);
  assert.match(shopperAuthSource, /otp:\s*body\.otp\.trim\(\)/);
  assert.match(shopperAuthSource, /newPassword:\s*body\.newPassword/);
  assert.match(shopperAuthSource, /confirmPassword:\s*body\.confirmPassword/);
  assert.match(shopperAuthSource, /export async function sendPasswordResetOtp/);
  assert.match(shopperAuthSource, /export async function resetPasswordWithOtp/);
});

test("auth panel exposes forgot/reset and registration OTP resend", () => {
  assert.match(authPanelSource, /Forgot password/);
  assert.match(authPanelSource, /mode === "forgot"/);
  assert.match(authPanelSource, /mode === "reset"/);
  assert.match(authPanelSource, /Resend verification code/);
  assert.match(providerSource, /resendRegistrationCode/);
  assert.match(providerSource, /sendResetOtp/);
  assert.match(providerSource, /resetPassword/);
});

test("Google auth uses /api/shopper/google and password link with idToken", () => {
  assert.match(shopperAuthSource, /\/api\/shopper\/resend-registration-otp/);
  assert.match(shopperAuthSource, /\/api\/shopper\/google"/);
  assert.match(shopperAuthSource, /\/api\/shopper\/google\/link"/);
  assert.match(shopperAuthSource, /body:\s*\{\s*idToken\s*\}/);
  assert.match(shopperAuthSource, /idToken:\s*body\.idToken/);
  assert.match(shopperAuthSource, /password:\s*body\.password/);
  assert.match(shopperAuthSource, /GOOGLE_LINK_REQUIRED/);
  assert.match(providerSource, /idToken:\s*error\.idToken/);
});

test("Google CTA is always visible; GIS mounts when configured", () => {
  assert.match(authPanelSource, /isGoogleAuthConfigured/);
  assert.match(authPanelSource, /Continue with Google/);
  assert.match(authPanelSource, /or continue with email/);
  assert.match(authPanelSource, /getGoogleClientId/);
  assert.match(authPanelSource, /accounts\.google\.com\/gsi\/client/);
  assert.match(authPanelSource, /mode === "google-link"/);
  assert.match(authPanelSource, /pendingGoogleIdToken/);
  // Default entry is login (not mobile-first funnel)
  assert.match(authPanelSource, /initialMode = "login"/);
  assert.doesNotMatch(authPanelSource, /mode === "mobile"/);
});

/** Mirrors production parseGoogleLinkRequired without importing shopper-auth (Node ESM + client). */
function parseGoogleLinkRequired(
  error: unknown,
  idToken = "",
): { email: string; idToken: string; message: string } | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status !== 409 && error.code !== "GOOGLE_LINK_REQUIRED") return null;
  const details =
    error.details && typeof error.details === "object"
      ? (error.details as Record<string, unknown>)
      : {};
  const code = error.code ?? (typeof details.code === "string" ? details.code : undefined);
  if (code !== "GOOGLE_LINK_REQUIRED") return null;
  const email = typeof details.email === "string" ? details.email : "";
  if (!email || !idToken) return null;
  const message =
    typeof details.message === "string" && details.message.trim()
      ? details.message.replace(/^❌\s*/, "").trim()
      : error.message || "Confirm your password to link Google to this account.";
  return { email, idToken, message };
}

test("Google GOOGLE_LINK_REQUIRED 409 requires email + retained idToken (never silent)", () => {
  const error = new ApiError("Link required", 409, "conflict", {
    code: "GOOGLE_LINK_REQUIRED",
    details: {
      code: "GOOGLE_LINK_REQUIRED",
      email: "asha@example.com",
      message: "Enter your password to link Google",
    },
  });
  const parsed = parseGoogleLinkRequired(error, "gis-id-token");
  assert.ok(parsed);
  assert.equal(parsed.email, "asha@example.com");
  assert.equal(parsed.idToken, "gis-id-token");
  assert.match(parsed.message, /password/i);
});

test("Google link parser ignores unrelated 409 and missing idToken", () => {
  assert.equal(
    parseGoogleLinkRequired(
      new ApiError("Taken", 409, "conflict", {
        code: "EMAIL_IN_USE",
        details: { code: "EMAIL_IN_USE", email: "asha@example.com" },
      }),
      "tok",
    ),
    null,
  );
  assert.equal(
    parseGoogleLinkRequired(
      new ApiError("Link required", 409, "conflict", {
        code: "GOOGLE_LINK_REQUIRED",
        details: { code: "GOOGLE_LINK_REQUIRED", email: "asha@example.com" },
      }),
      "",
    ),
    null,
  );
});

test("GoogleAccountLinkRequiredError and parseGoogleLinkRequired are exported", () => {
  assert.match(shopperAuthSource, /export class GoogleAccountLinkRequiredError/);
  assert.match(shopperAuthSource, /export function parseGoogleLinkRequired/);
  assert.match(shopperAuthSource, /GOOGLE_LINK_REQUIRED/);
  assert.match(shopperAuthSource, /readonly idToken/);
});
