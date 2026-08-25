import { cn } from "@/lib/cn";
import type { EntityStatus, OrderStatus, ProductStatus } from "@/types/admin";

const orderStyles: Record<OrderStatus, string> = {
  Pending: "bg-amber-50 text-amber-800 border-amber-200",
  Shipped: "bg-blue-50 text-blue-800 border-blue-200",
  Completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  Cancel: "bg-red-50 text-red-800 border-red-200",
  Incompleted: "bg-slate-100 text-slate-700 border-slate-200",
};

const productStyles: Record<ProductStatus, string> = {
  Published: "bg-emerald-50 text-emerald-800 border-emerald-200",
  Draft: "bg-amber-50 text-amber-800 border-amber-200",
  Inactive: "bg-orange-50 text-orange-800 border-orange-200",
  Archived: "bg-slate-100 text-slate-700 border-slate-200",
  Trash: "bg-red-50 text-red-800 border-red-200",
};

const entityStyles: Record<EntityStatus, string> = {
  Active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  Inactive: "bg-slate-100 text-slate-700 border-slate-200",
};

export function StatusBadge({
  status,
  kind = "order",
}: {
  status: string;
  kind?: "order" | "product" | "entity";
}) {
  const styles =
    kind === "product"
      ? productStyles[status as ProductStatus]
      : kind === "entity"
        ? entityStyles[status as EntityStatus]
        : orderStyles[status as OrderStatus];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
        styles ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {status}
    </span>
  );
}
