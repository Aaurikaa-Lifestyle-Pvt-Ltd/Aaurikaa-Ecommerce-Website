"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNav, isNavActive } from "@/lib/nav";
import { cn } from "@/lib/cn";

export function NavLinks({
  onNavigate,
  variant = "drawer",
}: {
  onNavigate?: () => void;
  variant?: "drawer" | "sidebar";
}) {
  const pathname = usePathname();
  const isSidebar = variant === "sidebar";

  return (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Admin">
      {adminNav.map((item) => {
        const active = isNavActive(pathname, item.href, "exact" in item ? item.exact : false);
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
