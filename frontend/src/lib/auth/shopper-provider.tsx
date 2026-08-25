"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@/lib/api/errors";
import {
  fetchShopperProfile,
  GoogleAccountLinkRequiredError,
  linkGoogleAccount,
  loginShopper,
  loginWithGoogle,
  logoutShopper,
  registerShopper,
  resendRegistrationOtp,
  resetPasswordWithOtp,
  sendPasswordResetOtp,
  verifyShopperRegistration,
  type ShopperLoginBody,
  type ShopperRegisterBody,
  type ShopperResetPasswordBody,
} from "@/lib/api/shopper-auth";
import { updateShopperProfile } from "@/lib/api/shopper-profile";
import { clearWishlistIdCache } from "@/lib/api/wishlist";
import { onUnauthorized } from "@/lib/api/client";
import {
  clearShopperSession,
  getShopperToken,
  getShopperUser,
  setShopperSession,
  type ShopperSessionUser,
} from "@/lib/api/token-store";
import { isApiConfigured } from "@/lib/api/config";

type Ok = { ok: true };
type Fail = { ok: false; error: string };
type GoogleLinkRequired = {
  ok: false;
  linkRequired: true;
  email: string;
  idToken: string;
  message: string;
};

interface AuthContextValue {
  user: ShopperSessionUser | null;
  ready: boolean;
  configured: boolean;
  login: (body: ShopperLoginBody) => Promise<Ok | Fail>;
  register: (body: ShopperRegisterBody) => Promise<(Ok & { email: string }) | Fail>;
  verifyRegistration: (
    body: ShopperRegisterBody & { otp: string },
  ) => Promise<Ok | Fail>;
  resendRegistrationCode: (body: {
    email: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<(Ok & { email: string }) | Fail>;
  sendResetOtp: (email: string) => Promise<Ok | Fail>;
  resetPassword: (body: ShopperResetPasswordBody) => Promise<Ok | Fail>;
  loginWithGoogleIdToken: (idToken: string) => Promise<Ok | Fail | GoogleLinkRequired>;
  linkGoogleWithPassword: (body: {
    idToken: string;
    password: string;
  }) => Promise<Ok | Fail>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  updateProfile: (body: {
    firstName: string;
    lastName: string;
    username: string;
    phone: string;
  }) => Promise<Ok | Fail>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function failMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function ShopperAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ShopperSessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const configured = isApiConfigured();

  useEffect(() => {
    const id = window.setTimeout(() => {
      const stored = getShopperUser();
      const token = getShopperToken();
      setUser(stored && token ? stored : null);
      setReady(true);

      if (!token || !configured) return;

      fetchShopperProfile()
        .then((profile) => {
          setUser(profile);
          setShopperSession(token, profile);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isUnauthorized) {
            clearShopperSession();
            setUser(null);
          }
        });
    }, 0);
    return () => window.clearTimeout(id);
  }, [configured]);

  useEffect(() => {
    return onUnauthorized(() => {
      clearWishlistIdCache();
      setUser(null);
    });
  }, []);

  const login = useCallback(async (body: ShopperLoginBody) => {
    try {
      const next = await loginShopper(body);
      setUser(next);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: failMessage(error, "Unable to sign in. Please try again."),
      };
    }
  }, []);

  const register = useCallback(async (body: ShopperRegisterBody) => {
    try {
      const result = await registerShopper(body);
      return { ok: true as const, email: result.email };
    } catch (error) {
      return {
        ok: false as const,
        error: failMessage(error, "Unable to create the account. Please try again."),
      };
    }
  }, []);

  const verifyRegistration = useCallback(
    async (body: ShopperRegisterBody & { otp: string }) => {
      try {
        await verifyShopperRegistration(body);
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error: failMessage(error, "Unable to verify the account. Please try again."),
        };
      }
    },
    [],
  );

  const resendRegistrationCode = useCallback(
    async (body: { email: string; firstName?: string; lastName?: string }) => {
      try {
        const result = await resendRegistrationOtp(body);
        return { ok: true as const, email: result.email };
      } catch (error) {
        return {
          ok: false as const,
          error: failMessage(error, "Unable to resend the verification code."),
        };
      }
    },
    [],
  );

  const sendResetOtp = useCallback(async (email: string) => {
    try {
      await sendPasswordResetOtp(email);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: failMessage(error, "Unable to send a reset code. Please try again."),
      };
    }
  }, []);

  const resetPassword = useCallback(async (body: ShopperResetPasswordBody) => {
    try {
      await resetPasswordWithOtp(body);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: failMessage(error, "Unable to reset the password. Please try again."),
      };
    }
  }, []);

  const loginWithGoogleIdToken = useCallback(async (idToken: string) => {
    try {
      const next = await loginWithGoogle(idToken);
      setUser(next);
      return { ok: true as const };
    } catch (error) {
      if (error instanceof GoogleAccountLinkRequiredError) {
        return {
          ok: false as const,
          linkRequired: true as const,
          email: error.email,
          idToken: error.idToken,
          message: error.message,
        };
      }
      return {
        ok: false as const,
        error: failMessage(error, "Unable to sign in with Google. Please try again."),
      };
    }
  }, []);

  const linkGoogleWithPassword = useCallback(
    async (body: { idToken: string; password: string }) => {
      try {
        const next = await linkGoogleAccount(body);
        setUser(next);
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error: failMessage(error, "Unable to link Google. Check your password and try again."),
        };
      }
    },
    [],
  );

  const logout = useCallback(() => {
    logoutShopper();
    clearWishlistIdCache();
    setUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = getShopperToken();
    if (!token) return;
    const profile = await fetchShopperProfile();
    setUser(profile);
    setShopperSession(token, profile);
  }, []);

  const updateProfile = useCallback(
    async (body: {
      firstName: string;
      lastName: string;
      username: string;
      phone: string;
    }) => {
      try {
        const next = await updateShopperProfile(body);
        setUser(next);
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error: failMessage(error, "Unable to update your profile. Please try again."),
        };
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      user,
      ready,
      configured,
      login,
      register,
      verifyRegistration,
      resendRegistrationCode,
      sendResetOtp,
      resetPassword,
      loginWithGoogleIdToken,
      linkGoogleWithPassword,
      logout,
      refreshProfile,
      updateProfile,
    }),
    [
      user,
      ready,
      configured,
      login,
      register,
      verifyRegistration,
      resendRegistrationCode,
      sendResetOtp,
      resetPassword,
      loginWithGoogleIdToken,
      linkGoogleWithPassword,
      logout,
      refreshProfile,
      updateProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useShopperAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useShopperAuth must be used within ShopperAuthProvider");
  }
  return ctx;
}
