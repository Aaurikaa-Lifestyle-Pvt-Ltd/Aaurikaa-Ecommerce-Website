export const FULFILMENT_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export function mapOrderStatusLabel(status?: string): string {
  switch (status) {
    case "shipped":
      return "Shipped";
    case "delivered":
      return "Completed";
    case "cancelled":
      return "Cancel";
    case "failed":
      return "Incompleted";
    default:
      return "Pending";
  }
}

export function omitPassword<T extends Record<string, unknown>>(raw: T): Omit<T, "password"> {
  const rest = { ...raw };
  delete rest.password;
  return rest as Omit<T, "password">;
}
