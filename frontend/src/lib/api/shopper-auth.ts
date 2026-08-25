import { apiRequest } from "./client";
import { ApiError } from "./errors";
import type { ShopperSessionUser } from "./token-store";
import { clearShopperSession, setShopperSession } from "./token-store";

export type ShopperLoginBody = {
  identifier: string;
  password: string;
};

export type ShopperRegisterBody = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
};

export type ShopperResetPasswordBody = {
  email: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
};

type LoginResponse = {
  token?: string;
  shopper?: ShopperSessionUser;
  message?: string;
};

type ProfileResponse = {
  shopper?: ShopperSessionUser & { _id?: string };
};

/** Thrown when Google sign-in finds an existing password account that must be linked. */
export class GoogleAccountLinkRequiredError extends Error {
  readonly email: string;
  /** GIS idToken to resubmit with password on /google/link (backend does not issue linkToken). */
  readonly idToken: string;

  constructor(email: string, idToken: string, message: string) {
    super(message);
    this.name = "GoogleAccountLinkRequiredError";
    this.email = email;
    this.idToken = idToken;
  }
}

export function getGoogleClientId(): string {
  return (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
}

export function isGoogleAuthConfigured(): boolean {
  return getGoogleClientId().length > 0;
}

function normalizeUser(raw: ShopperSessionUser & { _id?: string; id?: string }): ShopperSessionUser {
  return {
    id: String(raw.id ?? raw._id ?? ""),
    firstName: raw.firstName,
    lastName: raw.lastName,
    username: raw.username,
    email: raw.email,
    phone: raw.phone,
    profileImage: raw.profileImage,
  };
}

function applySession(response: LoginResponse): ShopperSessionUser {
  if (!response.token || !response.shopper) {
    throw new Error("Authentication succeeded without a session token.");
  }
  const user = normalizeUser(response.shopper);
  setShopperSession(response.token, user);
  return user;
}

function linkRequiredFromError(
  error: ApiError,
  idToken: string,
): GoogleAccountLinkRequiredError | null {
  if (error.status !== 409 && error.code !== "GOOGLE_LINK_REQUIRED") {
    return null;
  }
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
  return new GoogleAccountLinkRequiredError(email, idToken, message);
}

/** Testable parser for Google GOOGLE_LINK_REQUIRED 409 bodies. */
export function parseGoogleLinkRequired(
  error: unknown,
  idToken = "",
): GoogleAccountLinkRequiredError | null {
  if (error instanceof GoogleAccountLinkRequiredError) return error;
  if (!(error instanceof ApiError)) return null;
  return linkRequiredFromError(error, idToken);
}

export async function loginShopper(body: ShopperLoginBody): Promise<ShopperSessionUser> {
  const response = await apiRequest<LoginResponse>("/api/shopper/login", {
    method: "POST",
    auth: false,
    body: {
      identifier: body.identifier.trim(),
      password: body.password,
    },
  });
  return applySession(response);
}

export async function registerShopper(body: ShopperRegisterBody): Promise<{ email: string; expiresAt?: string }> {
  const form = new FormData();
  form.append("firstName", body.firstName.trim());
  form.append("lastName", body.lastName.trim());
  form.append("username", body.username.trim());
  form.append("email", body.email.trim());
  form.append("phone", body.phone.trim());
  form.append("password", body.password);
  const response = await apiRequest<{ email?: string; expiresAt?: string }>("/api/shopper/register", {
    method: "POST",
    auth: false,
    body: form,
  });
  return { email: response.email ?? body.email, expiresAt: response.expiresAt };
}

export async function verifyShopperRegistration(body: ShopperRegisterBody & { otp: string }): Promise<void> {
  const form = new FormData();
  form.append("firstName", body.firstName.trim());
  form.append("lastName", body.lastName.trim());
  form.append("username", body.username.trim());
  form.append("email", body.email.trim());
  form.append("phone", body.phone.trim());
  form.append("password", body.password);
  form.append("otp", body.otp.trim());
  await apiRequest("/api/shopper/verify-registration", {
    method: "POST",
    auth: false,
    body: form,
  });
}

export async function resendRegistrationOtp(body: {
  email: string;
  firstName?: string;
  lastName?: string;
}): Promise<{ email: string; expiresAt?: string }> {
  const response = await apiRequest<{ email?: string; expiresAt?: string }>(
    "/api/shopper/resend-registration-otp",
    {
      method: "POST",
      auth: false,
      body: {
        email: body.email.trim(),
        firstName: body.firstName?.trim(),
        lastName: body.lastName?.trim(),
      },
    },
  );
  return { email: response.email ?? body.email, expiresAt: response.expiresAt };
}

export async function sendPasswordResetOtp(email: string): Promise<{ expiresAt?: string }> {
  const response = await apiRequest<{ expiresAt?: string; message?: string }>(
    "/api/shopper/send-otp",
    {
      method: "POST",
      auth: false,
      body: { email: email.trim() },
    },
  );
  return { expiresAt: response.expiresAt };
}

export async function resetPasswordWithOtp(body: ShopperResetPasswordBody): Promise<void> {
  await apiRequest("/api/shopper/reset-password", {
    method: "POST",
    auth: false,
    body: {
      email: body.email.trim(),
      otp: body.otp.trim(),
      newPassword: body.newPassword,
      confirmPassword: body.confirmPassword,
    },
  });
}

export async function loginWithGoogle(idToken: string): Promise<ShopperSessionUser> {
  try {
    const response = await apiRequest<LoginResponse>("/api/shopper/google", {
      method: "POST",
      auth: false,
      body: { idToken },
    });
    return applySession(response);
  } catch (error) {
    const linkError = parseGoogleLinkRequired(error, idToken);
    if (linkError) throw linkError;
    throw error;
  }
}

export async function linkGoogleAccount(body: {
  idToken: string;
  password: string;
  identifier?: string;
}): Promise<ShopperSessionUser> {
  const response = await apiRequest<LoginResponse>("/api/shopper/google/link", {
    method: "POST",
    auth: false,
    body: {
      idToken: body.idToken,
      password: body.password,
      ...(body.identifier?.trim() ? { identifier: body.identifier.trim() } : {}),
    },
  });
  return applySession(response);
}

export async function fetchShopperProfile(): Promise<ShopperSessionUser> {
  const response = await apiRequest<ProfileResponse>("/api/shopper/profile", {
    auth: true,
  });
  if (!response.shopper) {
    throw new Error("Profile response was empty.");
  }
  const user = normalizeUser(response.shopper);
  return user;
}

export function logoutShopper(): void {
  clearShopperSession();
}
