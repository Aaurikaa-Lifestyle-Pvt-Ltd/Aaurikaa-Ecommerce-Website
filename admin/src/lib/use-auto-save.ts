"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast, toastMessageFromUnknown } from "@/lib/toast";

export type UseAutoSaveOptions<
  T extends Record<string, unknown>,
  R extends { id: string },
> = {
  data: T;
  enabled?: boolean;
  debounceMs?: number;
  /** Existing draft id (edit draft) or null on create. */
  initialDraftId?: string | null;
  /** When set, reset last-saved baseline so restore does not immediately re-save. */
  baselineSyncToken?: string | null;
  save: (payload: T & { id?: string }, signal: AbortSignal) => Promise<R>;
  onSaveSuccess?: (result: R) => void;
};

function payloadHasContent(data: Record<string, unknown>): boolean {
  return Object.values(data).some((val) => {
    if (typeof val === "string") return val.trim().length > 0;
    if (typeof val === "number") return Number.isFinite(val) && val !== 0;
    if (typeof val === "boolean") return true;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === "object" && val !== null) return Object.keys(val).length > 0;
    return false;
  });
}

/**
 * Debounced draft autosave (ANBAZAR useAutoSave pattern).
 * Abort in-flight on disable/unmount; skip empty payloads and unchanged snapshots.
 */
export function useAutoSave<
  T extends Record<string, unknown>,
  R extends { id: string },
>({
  data,
  enabled = true,
  debounceMs = 5000,
  initialDraftId = null,
  baselineSyncToken = null,
  save,
  onSaveSuccess,
}: UseAutoSaveOptions<T, R>) {
  const [lastSavedData, setLastSavedData] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  const dataRef = useRef(data);
  const draftIdRef = useRef<string | null>(initialDraftId ?? null);
  const lastSavedDataRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onSaveSuccessRef = useRef(onSaveSuccess);
  const saveRef = useRef(save);

  const applySavedBaseline = useCallback((snapshot: string) => {
    lastSavedDataRef.current = snapshot;
    setLastSavedData(snapshot);
  }, []);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    onSaveSuccessRef.current = onSaveSuccess;
  }, [onSaveSuccess]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (initialDraftId) {
      draftIdRef.current = initialDraftId;
      setDraftId(initialDraftId);
    }
  }, [initialDraftId]);

  useEffect(() => {
    if (baselineSyncToken) {
      applySavedBaseline(JSON.stringify(dataRef.current));
    }
  }, [baselineSyncToken, applySavedBaseline]);

  useEffect(() => {
    if (!enabled) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsSaving(false);
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!payloadHasContent(dataRef.current)) return;

    const handler = window.setTimeout(async () => {
      const currentDataStr = JSON.stringify(dataRef.current);
      if (currentDataStr === lastSavedDataRef.current) return;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsSaving(true);
      try {
        const payload = {
          ...dataRef.current,
          ...(draftIdRef.current ? { id: draftIdRef.current } : {}),
        } as T & { id?: string };
        const result = await saveRef.current(payload, controller.signal);
        if (controller.signal.aborted) return;

        const savedSnapshot =
          "savedSnapshot" in result && typeof result.savedSnapshot === "string"
            ? result.savedSnapshot
            : currentDataStr;
        applySavedBaseline(savedSnapshot);
        if (result.id && result.id !== draftIdRef.current) {
          draftIdRef.current = result.id;
          setDraftId(result.id);
        }
        onSaveSuccessRef.current?.(result);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("[useAutoSave]", err);
        toast.error(toastMessageFromUnknown(err, "Unable to autosave draft."));
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        if (!controller.signal.aborted) {
          setIsSaving(false);
        }
      }
    }, debounceMs);

    return () => window.clearTimeout(handler);
  }, [data, enabled, debounceMs, lastSavedData, draftId, applySavedBaseline]);

  const setDraftIdStable = useCallback((id: string | null) => {
    draftIdRef.current = id;
    setDraftId(id);
  }, []);

  return { isSaving, draftId, setDraftId: setDraftIdStable };
}
