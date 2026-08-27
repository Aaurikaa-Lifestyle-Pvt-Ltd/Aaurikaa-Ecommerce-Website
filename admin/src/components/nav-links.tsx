"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { adminNav, filterAdminNav, isNavActive } from "@/lib/nav";
import { cn } from "@/lib/cn";

export function NavLinks({
  onNavigate,
  variant = "drawer",
}: {
  onNavigate?: () => void;
  variant?: "drawer" | "sidebar";
}) {
  const pathname = usePathname();
  const { hasPermission, isSuperAdmin } = useAuth();
  const isSidebar = variant === "sidebar";
  const items = filterAdminNav(adminNav, { hasPermission, isSuperAdmin });

  return (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Admin">
      {items.map((item) => {
        const active = isNavActive(pathname, item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium transition touch-manipulation",
              isSidebar
                ? active
                  ? "bg-sidebar-active text-white"
                  : "text-sidebar-muted hover:bg-sidebar-active/70 hover:text-white"
                : active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
