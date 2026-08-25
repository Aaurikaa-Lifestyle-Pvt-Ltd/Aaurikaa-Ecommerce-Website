import { getApiBaseUrl, isApiConfigured } from "./config";
import {
  ApiError,
  codeFromBody,
  isInvalidSessionStatus,
  kindFromStatus,
  messageFromBody,
  userMessageForKind,
} from "./errors";
import { clearAdminSession, getAdminToken } from "./token-store";

export type ApiRequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized(): void {
  clearAdminSession();
  for (const listener of unauthorizedListeners) listener();
}

function parseJsonSafe(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  if (!isApiConfigured()) {
    throw new ApiError(
      "API base URL is not configured. Set NEXT_PUBLIC_API_BASE_URL.",
      0,
      "network",
    );
  }

  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (!isForm && options.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (options.auth !== false) {
    const token = getAdminToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else {
      throw new ApiError("Please sign in to continue.", 401, "unauthorized");
    }
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: isForm
        ? (options.body as FormData)
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
      cache: "no-store",
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new ApiError(userMessageForKind("network", ""), 0, "network");
  }

  const text = await response.text();
  const body = parseJsonSafe(text);
  const rawMessage = messageFromBody(body, response.statusText || "Request failed");

  if (!response.ok) {
    const kind = kindFromStatus(response.status);
    const error = new ApiError(userMessageForKind(kind, rawMessage), response.status, kind, {
      code: codeFromBody(body),
      details: body,
    });
    if (isInvalidSessionStatus(response.status, rawMessage)) {
      notifyUnauthorized();
    }
    throw error;
  }

  return body as T;
}

export async function apiRequestBlob(
  path: string,
  options: ApiRequestOptions = {},
): Promise<Blob> {
  if (!isApiConfigured()) {
    throw new ApiError(
      "API base URL is not configured. Set NEXT_PUBLIC_API_BASE_URL.",
      0,
      "network",
    );
  }

  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.auth !== false) {
    const token = getAdminToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else {
      throw new ApiError("Please sign in to continue.", 401, "unauthorized");
    }
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(userMessageForKind("network", ""), 0, "network");
  }

  if (!response.ok) {
    const text = await response.text();
    const body = parseJsonSafe(text);
    const rawMessage = messageFromBody(body, response.statusText || "Request failed");
    const kind = kindFromStatus(response.status);
    const error = new ApiError(userMessageForKind(kind, rawMessage), response.status, kind, {
      code: codeFromBody(body),
      details: body,
    });
    if (isInvalidSessionStatus(response.status, rawMessage)) {
      notifyUnauthorized();
    }
    throw error;
  }

  return response.blob();
}

export function unwrapData<T>(payload: { data?: T } | T): T {
  if (payload && typeof payload === "object" && "data" in payload && payload.data !== undefined) {
    return payload.data;
  }
  return payload as T;
}
