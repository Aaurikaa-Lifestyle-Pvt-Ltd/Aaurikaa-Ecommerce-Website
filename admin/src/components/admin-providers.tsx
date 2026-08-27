"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AdminShell } from "@/components/admin-shell";
import { ToastProvider } from "@/components/toast-provider";

function Guard({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";

  useEffect(() => {
    if (!ready) return;
    if (!user && !isLogin) router.replace("/admin/login");
    if (user && isLogin) router.replace("/admin");
  }, [ready, user, isLogin, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading admin…
      </div>
    );
  }

  if (isLogin) return <>{children}</>;
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Redirecting to login…
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}

export function AdminProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <Guard>{children}</Guard>
      </ToastProvider>
    </AuthProvider>
  );
}
