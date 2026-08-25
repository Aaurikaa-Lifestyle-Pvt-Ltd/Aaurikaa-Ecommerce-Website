"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fetchSearchSuggestions } from "@/lib/api/search";
import { isApiCatalogue } from "@/lib/api/config";
import {
  groupSuggestionItems,
  highlightQuery,
  isSuggestionTermReady,
  mapGroupedSuggestions,
  type SuggestionItem,
} from "@/lib/search-suggestions";
import { cn } from "@/lib/cn";
import { IconClose, IconSearch } from "@/components/ui/icons";

const DEBOUNCE_MS = 280;

type SearchAutocompleteProps = {
  /** Called after a successful navigate/submit so the host can close overlays. */
  onClose?: () => void;
  /** Autofocus the field when mounted (header strip / drawer). */
  autoFocus?: boolean;
  className?: string;
  /** Compact layout for the mobile drawer. */
  compact?: boolean;
};

export function SearchAutocomplete({
  onClose,
  autoFocus = false,
  className,
  compact = false,
}: SearchAutocompleteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listboxId = useId();

  const initialQ =
    pathname === "/search" ? (searchParams.get("q") ?? "").trim() : "";

  const [value, setValue] = useState(initialQ);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SuggestionItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep field in sync when navigating between search URLs.
  useEffect(() => {
    if (pathname === "/search") {
      setValue((searchParams.get("q") ?? "").trim());
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!autoFocus) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [autoFocus]);

  useEffect(() => {
    function onDocPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
  }, []);

  useEffect(() => {
    const term = value.trim();
    abortRef.current?.abort();
    abortRef.current = null;

    if (!isSuggestionTermReady(term) || !isApiCatalogue()) {
      setItems([]);
      setLoading(false);
      setFetchedFor(null);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const handle = window.setTimeout(async () => {
      try {
        const raw = await fetchSearchSuggestions(term, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setItems(mapGroupedSuggestions(raw));
        setFetchedFor(term);
        setActiveIndex(-1);
        setOpen(true);
      } catch {
        if (controller.signal.aborted) return;
        setItems([]);
        setFetchedFor(term);
        setOpen(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [value]);

  const closePanel = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const go = useCallback(
    (href: string) => {
      closePanel();
      onClose?.();
      router.push(href);
    },
    [closePanel, onClose, router],
  );

  const submitSearch = useCallback(
    (raw: string) => {
      const q = raw.trim();
      closePanel();
      onClose?.();
      if (!q) {
        router.push("/search");
        return;
      }
      router.push(`/search?q=${encodeURIComponent(q)}`);
    },
    [closePanel, onClose, router],
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeIndex >= 0 && items[activeIndex]) {
      go(items[activeIndex].href);
      return;
    }
    submitSearch(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (open) {
        closePanel();
        return;
      }
      onClose?.();
      return;
    }

    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      if (items.length > 0) setOpen(true);
      return;
    }

    if (!open || items.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
      return;
    }
  }

  const termReady = isSuggestionTermReady(value);
  const showPanel = open && termReady && isApiCatalogue();
  const sections = groupSuggestionItems(items);
  const showEmpty =
    showPanel && !loading && fetchedFor === value.trim() && items.length === 0;

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <form
        role="search"
        className={cn(
          "flex items-center gap-2",
          compact ? "flex-col items-stretch gap-2" : "gap-3",
        )}
        onSubmit={onSubmit}
      >
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-control border border-border bg-background px-3",
            compact ? "h-11" : "h-10",
          )}
        >
          <IconSearch className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            name="q"
            value={value}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search jewellery…"
            aria-label="Search jewellery"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={showPanel}
            aria-activedescendant={
              activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
            }
            className="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (termReady) setOpen(true);
            }}
            onKeyDown={onKeyDown}
          />
          {value ? (
            <button
              type="button"
              className="shrink-0 rounded-control p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
              onClick={() => {
                setValue("");
                setItems([]);
                closePanel();
                inputRef.current?.focus();
              }}
            >
              <IconClose className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <button
          type="submit"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-control bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "h-11 w-full" : "h-10",
          )}
        >
          Search
        </button>
      </form>

      {showPanel ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute left-0 right-0 z-50 mt-2 max-h-[min(70vh,24rem)] overflow-y-auto rounded-card border border-border bg-surface shadow-card"
        >
          {loading ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>
          ) : null}

          {showEmpty ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No matches. Press Search to browse results.
            </p>
          ) : null}

          {!loading && sections.length > 0 ? (
            <ul className="py-2">
              {sections.map((section) => (
                <li key={section.kind} className="px-2 pb-1">
                  <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {section.label}
                  </p>
                  <ul>
                    {section.items.map((item) => {
                      const index = items.indexOf(item);
                      const active = index === activeIndex;
                      return (
                        <li key={item.id} role="presentation">
                          <button
                            type="button"
                            id={`${listboxId}-option-${index}`}
                            role="option"
                            aria-selected={active}
                            className={cn(
                              "flex w-full flex-col items-start gap-0.5 rounded-control px-2 py-2 text-left text-sm transition-colors",
                              active
                                ? "bg-muted text-foreground"
                                : "text-foreground hover:bg-muted/70",
                            )}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => go(item.href)}
                          >
                            <span>
                              {highlightQuery(item.label, value).map((part, i) =>
                                part.match ? (
                                  <mark
                                    key={`${item.id}-${i}`}
                                    className="bg-transparent font-semibold text-foreground underline decoration-primary/40 decoration-2 underline-offset-2"
                                  >
                                    {part.text}
                                  </mark>
                                ) : (
                                  <span key={`${item.id}-${i}`}>{part.text}</span>
                                ),
                              )}
                            </span>
                            {item.meta ? (
                              <span className="text-xs text-muted-foreground">
                                {item.meta}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
