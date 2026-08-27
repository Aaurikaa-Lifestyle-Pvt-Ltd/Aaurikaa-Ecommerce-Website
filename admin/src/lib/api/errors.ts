export type ApiErrorKind =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "server"
  | "network"
  | "unknown";

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    kind: ApiErrorKind,
    options?: { code?: string; details?: unknown },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
    this.code = options?.code;
    this.details = options?.details;
  }

  get isUnauthorized(): boolean {
    if (this.kind === "unauthorized") return true;
    if (isInvalidSessionStatus(this.status, this.message)) return true;
    // Client may replace the message with a friendly forbidden string; check body too.
    const raw = messageFromBody(this.details, "");
    return Boolean(raw) && isInvalidSessionStatus(this.status, raw);
  }
}

export function kindFromStatus(status: number): ApiErrorKind {
  if (status === 400 || status === 422) return "validation";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "unknown";
}

export function userMessageForKind(kind: ApiErrorKind, fallback: string): string {
  switch (kind) {
    case "validation":
      return fallback || "Please check the form and try again.";
    case "unauthorized":
      return "Your session has expired. Please sign in again.";
    case "forbidden":
      return "You do not have permission to do that.";
    case "not_found":
      return fallback || "The requested item could not be found.";
    case "conflict":
      return fallback || "This change conflicts with the current state.";
    case "rate_limited":
      return "Too many requests. Please wait a moment and try again.";
    case "server":
      return "The server could not complete this request. Please try again.";
    case "network":
      return "Unable to reach the server. Check your connection and try again.";
    default:
      return fallback || "Something went wrong. Please try again.";
  }
}

export function isInvalidSessionStatus(status: number, message?: string): boolean {
  if (status === 401) return true;
  if (status !== 403) return false;
  const text = (message ?? "").toLowerCase();
  // Plain RBAC "Access denied" stays forbidden (do not logout).
  return (
    text.includes("no token") ||
    text.includes("invalid token") ||
    text.includes("expired") ||
    text.includes("token required") ||
    text.includes("revoked") ||
    text.includes("deactivated")
  );
}

export function messageFromBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.replace(/^✅\s*|^❌\s*/, "").trim();
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }
  return fallback;
}

export function codeFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  return typeof record.code === "string" ? record.code : undefined;
}
