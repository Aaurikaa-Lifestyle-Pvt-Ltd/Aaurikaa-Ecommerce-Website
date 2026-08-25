"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { isApiConfigured } from "@/lib/api/config";

export function useAdminResource<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const configured = isApiConfigured();

  const reload = useCallback(async () => {
    if (!configured) {
      setError("API base URL is not configured. Set NEXT_PUBLIC_API_BASE_URL.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await loader();
      setData(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load this page.");
    } finally {
      setLoading(false);
    }
    // Callers pass a deps array; the list is not a static literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, [configured, ...deps]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, setData, configured };
}
