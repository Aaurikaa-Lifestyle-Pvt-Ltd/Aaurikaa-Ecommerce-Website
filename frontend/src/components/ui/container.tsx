import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

/** Centered page/section width with responsive gutters. */
export function Container({ children, className }: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-10",
        className,
      )}
    >
      {children}
    </div>
  );
}
