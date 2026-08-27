"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { NavLinks } from "./nav-links";
import { MobileDrawer } from "./mobile-drawer";
import { Button } from "./ui";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-[var(--header-height)] items-center border-b border-white/10 px-5">
          <Link href="/admin" className="block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-300">
              AAURIKAA
            </p>
            <p className="text-sm font-semibold text-white">Admin Console</p>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <NavLinks variant="sidebar" />
        </div>
        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm font-medium text-white">{user?.name}</p>
          <p className="truncate text-xs text-sidebar-muted">{user?.email}</p>
        </div>
      </aside>

      <div className="lg:pl-[var(--sidebar-width)]">
        <header className="sticky top-0 z-20 flex h-[var(--header-height)] items-center gap-3 border-b border-border bg-surface/95 px-3 backdrop-blur sm:px-5">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface hover:bg-muted touch-manipulation lg:hidden"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon />
          </button>

          <div className="min-w-0 flex-1 lg:hidden">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">
              AAURIKAA Admin
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-foreground">{user?.name}</p>
              <p className="text-xs text-muted-foreground">Signed in</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {(user?.name ?? "A").slice(0, 1)}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                logout();
                router.replace("/admin/login");
              }}
            >
              Log out
            </Button>
          </div>
        </header>

        <main className="px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
          <div className="mx-auto max-w-6xl animate-rise-in">{children}</div>
        </main>
      </div>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
