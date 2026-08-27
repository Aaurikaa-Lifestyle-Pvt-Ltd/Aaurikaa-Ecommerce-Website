/**
 * Map unknown caught values to concise user-facing toast copy.
 * Prefer ApiError.message (already sanitized by the API client).
 */
export function toastMessageFromUnknown(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (err instanceof Error) {
    const message = err.message?.trim() ?? "";
    // ApiError from the admin client already carries user-safe copy.
    if (err.name === "ApiError" && message) {
      return message;
    }
    // Avoid leaking raw Axios/Node/Mongo internals into the UI.
    if (
      !message ||
      /AxiosError|MongoServerError|E11000|Request failed with status code|at\s+\S+\s+\(/i.test(
        message,
      )
    ) {
      return fallback;
    }
    return message;
  }
  return fallback;
}
