"use client";

import { useEffect, useId, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { DiscoveryQuery, PriceBounds, ProductSort } from "@/types/discovery";
import type { MegaMenuTree } from "@/lib/mappers/mega-menu";
import {
  SORT_OPTIONS,
  buildDiscoverySearchParams,
  clearDiscoveryFilters,
  hasActiveFilters,
} from "@/lib/discovery";
import { cn } from "@/lib/cn";
import {
  IconClose,
  IconChevronDown,
  IconFilter,
  IconPlus,
  IconMinus,
} from "@/components/ui/icons";

export type DiscoveryFilterMode = "taxonomy" | "search" | "simple";

interface DiscoveryToolbarProps {
  query: DiscoveryQuery;
  resultCount: number;
  priceBounds?: PriceBounds;
  taxonomyOptions?: MegaMenuTree;
  filterMode?: DiscoveryFilterMode;
  resetHref?: string;
  className?: string;
}

function countLabel(resultCount: number): string {
  if (resultCount === 0) return "No products";
  if (resultCount === 1) return "1 product";
  return `${resultCount} products`;
}

export function DiscoveryToolbar({
  query,
  resultCount,
  priceBounds,
  taxonomyOptions = [],
  filterMode = "simple",
  resetHref,
  className,
}: DiscoveryToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [activePopover, setActivePopover] = useState<"price" | "availability" | "offers" | "category" | null>(null);
  
  // Accordion toggle states inside drawer
  const [categoryExpanded, setCategoryExpanded] = useState(true);
  const [priceExpanded, setPriceExpanded] = useState(true);
  const [statusExpanded, setStatusExpanded] = useState(true);

  // Price bounds range — local draft until Apply
  const minLimit = priceBounds?.minPrice ?? 0;
  const maxLimit = priceBounds?.maxPrice ?? 20000;
  const [draftMin, setDraftMin] = useState<number>(query.minPrice ?? minLimit);
  const [draftMax, setDraftMax] = useState<number>(query.maxPrice ?? maxLimit);

  const titleId = useId();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftMin(query.minPrice ?? (priceBounds?.minPrice ?? 0));
    setDraftMax(query.maxPrice ?? (priceBounds?.maxPrice ?? 20000));
  }, [query.minPrice, query.maxPrice, priceBounds?.minPrice, priceBounds?.maxPrice]);

  function navigate(next: DiscoveryQuery) {
    router.push(
      `${pathname}${buildDiscoverySearchParams({ ...next, page: 1 })}`,
      { scroll: false },
    );
  }

  function resetFilters() {
    setDraftMin(priceBounds?.minPrice ?? 0);
    setDraftMax(priceBounds?.maxPrice ?? 20000);
    if (resetHref) {
      router.push(resetHref, { scroll: false });
      return;
    }
    navigate(clearDiscoveryFilters(query));
  }

  function clampPrice(value: number, floor: number, ceiling: number): number {
    if (!Number.isFinite(value)) return floor;
    return Math.min(ceiling, Math.max(floor, Math.round(value)));
  }

  function applyPriceFilter() {
    const nextMin = clampPrice(draftMin, minLimit, maxLimit);
    const nextMax = clampPrice(draftMax, minLimit, maxLimit);
    const lo = Math.min(nextMin, nextMax);
    const hi = Math.max(nextMin, nextMax);
    setDraftMin(lo);
    setDraftMax(hi);
    navigate({
      ...query,
      minPrice: lo <= minLimit ? undefined : lo,
      maxPrice: hi >= maxLimit ? undefined : hi,
    });
  }

  function clearPriceFilter() {
    setDraftMin(minLimit);
    setDraftMax(maxLimit);
    navigate({ ...query, minPrice: undefined, maxPrice: undefined });
  }

  const filtersActive = hasActiveFilters(query);
  const showTaxonomyFacets = filterMode === "search";
  const showPrice =
    filterMode !== "simple" &&
    priceBounds != null &&
    priceBounds.minPrice != null &&
    priceBounds.maxPrice != null &&
    priceBounds.maxPrice > priceBounds.minPrice;

  // Handle closing popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setActivePopover(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync keyboard escape key
  useEffect(() => {
    if (!filtersOpen && !sortOpen && !activePopover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFiltersOpen(false);
        setSortOpen(false);
        setActivePopover(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtersOpen, sortOpen, activePopover]);

  const selectedCategory = taxonomyOptions.find((c) => c.slug === query.category);
  const subcategoryOptions = selectedCategory?.subcategories ?? [];
  const selectedSub = subcategoryOptions.find((s) => s.slug === query.subcategory);
  const childOptions = selectedSub?.children ?? [];

  // Active filter chip descriptors
  const activeChips: { label: string; onRemove: () => void }[] = [];
  
  if (query.category && showTaxonomyFacets) {
    const name = taxonomyOptions.find((c) => c.slug === query.category)?.name || query.category;
    activeChips.push({
      label: `Category: ${name}`,
      onRemove: () => navigate({ ...query, category: undefined, subcategory: undefined, child: undefined }),
    });
  }
  if (query.subcategory && showTaxonomyFacets) {
    const name = subcategoryOptions.find((s) => s.slug === query.subcategory)?.name || query.subcategory;
    activeChips.push({
      label: `Subcategory: ${name}`,
      onRemove: () => navigate({ ...query, subcategory: undefined, child: undefined }),
    });
  }
  if (query.child && showTaxonomyFacets) {
    const name = childOptions.find((c) => c.slug === query.child)?.name || query.child;
    activeChips.push({
      label: `Type: ${name}`,
      onRemove: () => navigate({ ...query, child: undefined }),
    });
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    let label = "Price: ";
    if (query.minPrice !== undefined && query.maxPrice !== undefined) {
      label += `₹${query.minPrice} - ₹${query.maxPrice}`;
    } else if (query.minPrice !== undefined) {
      label += `From ₹${query.minPrice}`;
    } else {
      label += `Up to ₹${query.maxPrice}`;
    }
    activeChips.push({
      label,
      onRemove: () => clearPriceFilter(),
    });
  }
  if (query.inStockOnly) {
    activeChips.push({
      label: "In Stock",
      onRemove: () => navigate({ ...query, inStockOnly: false }),
    });
  }
  if (query.onSaleOnly) {
    activeChips.push({
      label: "On Sale",
      onRemove: () => navigate({ ...query, onSaleOnly: false }),
    });
  }

  return (
    <div className={cn("border-y border-border/70 py-3.5", className)}>
      <div className="flex items-center justify-between gap-4">
        
        {/* Left Side: Desktop Filter controls & Triggers */}
        <div className="hidden items-center gap-2.5 sm:flex" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-control border border-border bg-surface px-4 text-xs font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-foreground/30 hover:bg-muted"
          >
            <IconFilter className="h-3.5 w-3.5" />
            Filters
          </button>

          {/* Quick Category Filter (Only in Global Search mode) */}
          {showTaxonomyFacets && taxonomyOptions.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setActivePopover(activePopover === "category" ? null : "category")}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-control border px-3.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground",
                  query.category ? "border-[#C5A880] bg-[#FAF5EB] text-[#8C6014] font-medium" : "border-border bg-surface"
                )}
              >
                Category
                <IconChevronDown className="h-3 w-3" />
              </button>
              {activePopover === "category" && (
                <div className="absolute left-0 mt-2 z-30 w-56 rounded-card border border-border bg-surface p-4 shadow-card">
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Category</h4>
                  <ul className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          navigate({ ...query, category: undefined, subcategory: undefined, child: undefined });
                          setActivePopover(null);
                        }}
                        className={cn(
                          "w-full text-left text-xs px-2 py-1.5 rounded-control hover:bg-muted/55",
                          !query.category && "bg-muted font-medium text-foreground"
                        )}
                      >
                        All categories
                      </button>
                    </li>
                    {taxonomyOptions.map((cat) => (
                      <li key={cat.id}>
                        <button
                          type="button"
                          onClick={() => {
                            navigate({ ...query, category: cat.slug, subcategory: undefined, child: undefined });
                            setActivePopover(null);
                          }}
                          className={cn(
                            "w-full text-left text-xs px-2 py-1.5 rounded-control hover:bg-muted/55",
                            query.category === cat.slug && "bg-muted font-medium text-foreground"
                          )}
                        >
                          {cat.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Quick Price Filter */}
          {showPrice && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setActivePopover(activePopover === "price" ? null : "price")}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-control border px-3.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground",
                  (query.minPrice !== undefined || query.maxPrice !== undefined) ? "border-accent bg-accent/5 text-accent hover:text-accent" : "border-border bg-surface"
                )}
              >
                Price
                <IconChevronDown className="h-3 w-3" />
              </button>
              {activePopover === "price" && (
                <div className="absolute left-0 mt-2 z-30 w-72 rounded-card border border-border bg-surface p-5 shadow-card">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Price range (₹)
                  </h4>
                  <p className="mb-3 text-[11px] text-muted-foreground">
                    Catalogue range ₹{minLimit.toLocaleString("en-IN")} – ₹
                    {maxLimit.toLocaleString("en-IN")}
                  </p>
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <label className="block text-[11px] text-muted-foreground">
                      Min
                      <input
                        type="number"
                        inputMode="numeric"
                        min={minLimit}
                        max={maxLimit}
                        value={draftMin}
                        onChange={(e) => setDraftMin(Number(e.target.value))}
                        className="mt-1 h-9 w-full rounded-control border border-border bg-surface px-2.5 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </label>
                    <label className="block text-[11px] text-muted-foreground">
                      Max
                      <input
                        type="number"
                        inputMode="numeric"
                        min={minLimit}
                        max={maxLimit}
                        value={draftMax}
                        onChange={(e) => setDraftMax(Number(e.target.value))}
                        className="mt-1 h-9 w-full rounded-control border border-border bg-surface px-2.5 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </label>
                  </div>
                  <div className="mb-4">
                    <input
                      type="range"
                      min={minLimit}
                      max={maxLimit}
                      value={Math.min(Math.max(draftMax, minLimit), maxLimit)}
                      onChange={(e) => setDraftMax(Number(e.target.value))}
                      className="w-full accent-accent bg-muted h-1 rounded-full cursor-pointer"
                      aria-label="Maximum price"
                    />
                  </div>
                  <div className="flex justify-between items-center border-t border-border/60 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        clearPriceFilter();
                        setActivePopover(null);
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        applyPriceFilter();
                        setActivePopover(null);
                      }}
                      className="h-8 rounded-control bg-primary px-3 text-xs text-white hover:bg-primary/90"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Availability Switcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover(activePopover === "availability" ? null : "availability")}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-control border px-3.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground",
                query.inStockOnly ? "border-accent bg-accent/5 text-accent hover:text-accent" : "border-border bg-surface"
              )}
            >
              Availability
              <IconChevronDown className="h-3 w-3" />
            </button>
            {activePopover === "availability" && (
              <div className="absolute left-0 mt-2 z-30 w-48 rounded-card border border-border bg-surface p-4 shadow-card">
                <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={query.inStockOnly}
                    onChange={(e) => {
                      navigate({ ...query, inStockOnly: e.target.checked });
                      setActivePopover(null);
                    }}
                    className="h-4 w-4 rounded-control border-border accent-primary cursor-pointer"
                  />
                  <span>In stock only</span>
                </label>
              </div>
            )}
          </div>

          {/* Quick Offers Switcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover(activePopover === "offers" ? null : "offers")}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-control border px-3.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground",
                query.onSaleOnly ? "border-[#C5A880] bg-[#FAF5EB] text-[#8C6014] font-medium" : "border-border bg-surface"
              )}
            >
              Offers
              <IconChevronDown className="h-3 w-3" />
            </button>
            {activePopover === "offers" && (
              <div className="absolute left-0 mt-2 z-30 w-48 rounded-card border border-border bg-surface p-4 shadow-card">
                <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={query.onSaleOnly}
                    onChange={(e) => {
                      navigate({ ...query, onSaleOnly: e.target.checked });
                      setActivePopover(null);
                    }}
                    className="h-4 w-4 rounded-control border-border accent-primary cursor-pointer"
                  />
                  <span>On sale only</span>
                </label>
              </div>
            )}
          </div>

          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Mobile Filter & Sort Triggers */}
        <div className="flex w-full items-center justify-between gap-3 sm:hidden">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="flex-1 inline-flex h-9 items-center justify-center gap-2 rounded-control border border-border bg-surface text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-muted"
          >
            <IconFilter className="h-3 w-3" />
            Filter{filtersActive ? " •" : ""}
          </button>
          <button
            type="button"
            onClick={() => setSortOpen(true)}
            className="flex-1 inline-flex h-9 items-center justify-center gap-2 rounded-control border border-border bg-surface text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-muted"
          >
            Sort
            <IconChevronDown className="h-3 w-3" />
          </button>
        </div>

        {/* Right Side: Product Count & Desktop Sort */}
        <div className="hidden items-center gap-4 sm:flex">
          <span className="text-xs text-muted-foreground">
            {countLabel(resultCount)}
          </span>
          
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground font-medium">Sort By:</span>
            <select
              value={query.sort}
              onChange={(e) =>
                navigate({ ...query, sort: e.target.value as ProductSort })
              }
              className="h-9 rounded-control border border-border bg-surface px-3 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
              aria-label="Sort products"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

      </div>

      {/* Active Filter Chips Row (Desktop Only) */}
      {activeChips.length > 0 && (
        <div className="hidden flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50 sm:flex">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">Active:</span>
          {activeChips.map((chip, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#d6c7b2] bg-[#fbf9f5] px-3 py-1 text-xs font-medium text-[#2d2924] shadow-2xs transition-colors hover:border-[#bda88d]"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-[#ebdcc8] hover:text-foreground transition-colors"
                aria-label="Remove filter"
              >
                <IconClose className="h-3 w-3" strokeWidth={2} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={resetFilters}
            className="text-[10px] font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Desktop/Tablet Side Drawer Overlay */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="presentation">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-foreground/45 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setFiltersOpen(false)}
          />
          
          {/* Sliding Panel */}
          <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="w-screen max-w-md bg-surface shadow-card flex flex-col h-full border-l border-border/70"
            >
              {/* Drawer Header */}
              <div className="px-6 py-5 border-b border-border/60 flex items-center justify-between">
                <div>
                  <h2 id={titleId} className="font-serif text-lg text-foreground font-medium">
                    Filters
                  </h2>
                  <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">
                    {countLabel(resultCount)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {filtersActive && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="text-xs text-muted-foreground hover:text-foreground font-medium underline underline-offset-2"
                    >
                      Clear all
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                    aria-label="Close filters"
                  >
                    <IconClose className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Drawer Body (Scrollable Accordions) */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                
                {/* Accordion 1: Categories (Only in global search or taxonomy navigation mode) */}
                {showTaxonomyFacets && taxonomyOptions.length > 0 && (
                  <div className="border-b border-border/60 pb-4">
                    <button
                      type="button"
                      onClick={() => setCategoryExpanded(!categoryExpanded)}
                      className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-foreground mb-3"
                    >
                      <span>Category Hierarchy</span>
                      {categoryExpanded ? <IconMinus className="h-3.5 w-3.5" /> : <IconPlus className="h-3.5 w-3.5" />}
                    </button>
                    
                    {categoryExpanded && (
                      <div className="space-y-3 pl-1 mt-2">
                        {taxonomyOptions.map((cat) => (
                          <div key={cat.id} className="space-y-1.5">
                            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={query.category === cat.slug}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    navigate({ ...query, category: cat.slug, subcategory: undefined, child: undefined });
                                  } else {
                                    navigate({ ...query, category: undefined, subcategory: undefined, child: undefined });
                                  }
                                }}
                                className="h-4 w-4 rounded-control border-border accent-primary cursor-pointer"
                              />
                              <span className={cn(query.category === cat.slug && "text-accent font-semibold")}>{cat.name}</span>
                            </label>

                            {/* Subcategories (Hierarchical nesting) */}
                            {query.category === cat.slug && cat.subcategories.length > 0 && (
                              <div className="pl-5 space-y-1.5 border-l border-accent/20 ml-2 py-1">
                                {cat.subcategories.map((sub) => (
                                  <div key={sub.id} className="space-y-1.5">
                                    <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={query.subcategory === sub.slug}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            navigate({ ...query, subcategory: sub.slug, child: undefined });
                                          } else {
                                            navigate({ ...query, subcategory: undefined, child: undefined });
                                          }
                                        }}
                                        className="h-3.5 w-3.5 rounded-control border-border accent-accent cursor-pointer"
                                      />
                                      <span className={cn(query.subcategory === sub.slug && "text-accent font-semibold")}>{sub.name}</span>
                                    </label>

                                    {/* Child categories (Only when parent is selected) */}
                                    {query.subcategory === sub.slug && sub.children.length > 0 && (
                                      <div className="pl-4 space-y-1 py-1 flex flex-col">
                                        {sub.children.map((child) => (
                                          <label key={child.id} className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer select-none">
                                            <input
                                              type="checkbox"
                                              checked={query.child === child.slug}
                                              onChange={(e) => {
                                                navigate({ ...query, child: e.target.checked ? child.slug : undefined });
                                              }}
                                              className="h-3 w-3 rounded-control border-border accent-accent cursor-pointer"
                                            />
                                            <span className={cn(query.child === child.slug && "text-accent font-semibold")}>{child.name}</span>
                                          </label>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Accordion 2: Price Range */}
                {showPrice && (
                  <div className="border-b border-border/60 pb-4">
                    <button
                      type="button"
                      onClick={() => setPriceExpanded(!priceExpanded)}
                      className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-foreground mb-3"
                    >
                      <span>Price Range</span>
                      {priceExpanded ? <IconMinus className="h-3.5 w-3.5" /> : <IconPlus className="h-3.5 w-3.5" />}
                    </button>
                    
                    {priceExpanded && (
                      <div className="pt-2 space-y-3">
                        <p className="text-[11px] text-muted-foreground">
                          Catalogue range ₹{minLimit.toLocaleString("en-IN")} – ₹
                          {maxLimit.toLocaleString("en-IN")}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block text-[11px] text-muted-foreground">
                            Min (₹)
                            <input
                              type="number"
                              inputMode="numeric"
                              min={minLimit}
                              max={maxLimit}
                              value={draftMin}
                              onChange={(e) => setDraftMin(Number(e.target.value))}
                              className="mt-1 h-9 w-full rounded-control border border-border bg-surface px-2.5 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                          </label>
                          <label className="block text-[11px] text-muted-foreground">
                            Max (₹)
                            <input
                              type="number"
                              inputMode="numeric"
                              min={minLimit}
                              max={maxLimit}
                              value={draftMax}
                              onChange={(e) => setDraftMax(Number(e.target.value))}
                              className="mt-1 h-9 w-full rounded-control border border-border bg-surface px-2.5 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                          </label>
                        </div>
                        <input
                          type="range"
                          min={minLimit}
                          max={maxLimit}
                          value={Math.min(Math.max(draftMax, minLimit), maxLimit)}
                          onChange={(e) => setDraftMax(Number(e.target.value))}
                          className="w-full accent-accent bg-muted h-1.5 rounded-full cursor-pointer"
                          aria-label="Maximum price"
                        />
                        <div className="text-center text-xs font-semibold text-accent">
                          ₹{Math.min(draftMin, draftMax).toLocaleString("en-IN")} – ₹
                          {Math.max(draftMin, draftMax).toLocaleString("en-IN")}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Accordion 3: Product Status */}
                <div className="pb-4">
                  <button
                    type="button"
                    onClick={() => setStatusExpanded(!statusExpanded)}
                    className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-foreground mb-3"
                  >
                    <span>Availability & Offers</span>
                    {statusExpanded ? <IconMinus className="h-3.5 w-3.5" /> : <IconPlus className="h-3.5 w-3.5" />}
                  </button>
                  
                  {statusExpanded && (
                    <div className="space-y-3.5 pl-1.5 pt-1.5">
                      <label className="flex items-center gap-2.5 text-xs font-medium text-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={query.inStockOnly}
                          onChange={(e) => navigate({ ...query, inStockOnly: e.target.checked })}
                          className="h-4 w-4 rounded-control border-border accent-primary cursor-pointer"
                        />
                        <span>In stock only</span>
                      </label>
                      <label className="flex items-center gap-2.5 text-xs font-medium text-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={query.onSaleOnly}
                          onChange={(e) => navigate({ ...query, onSaleOnly: e.target.checked })}
                          className="h-4 w-4 rounded-control border-border accent-primary cursor-pointer"
                        />
                        <span>On sale</span>
                      </label>
                    </div>
                  )}
                </div>

              </div>

              {/* Drawer Footer Actions */}
              <div className="px-6 py-5 border-t border-border/60 bg-muted/20 flex gap-4">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="flex-1 h-11 rounded-control border border-border bg-surface text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-muted"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (showPrice) {
                      applyPriceFilter();
                    }
                    setFiltersOpen(false);
                  }}
                  className="flex-1 h-11 rounded-control bg-primary text-xs font-semibold uppercase tracking-wider text-white hover:bg-primary/95 flex items-center justify-center gap-2 shadow-soft"
                >
                  Apply Filters
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Mobile Sort Bottom Drawer Overlay */}
      {sortOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:hidden" role="presentation">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setSortOpen(false)}
          />
          
          {/* Bottom Sheet container */}
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full rounded-t-card border border-border bg-surface p-5 shadow-card"
          >
            {/* Grabber indicator */}
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
            
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-base text-foreground font-semibold">Sort By</h2>
              <button
                type="button"
                onClick={() => setSortOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground font-medium uppercase tracking-wider"
              >
                Close
              </button>
            </div>
            
            <ul className="flex flex-col gap-1.5 pb-2">
              {SORT_OPTIONS.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => {
                      navigate({ ...query, sort: option.value });
                      setSortOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-control px-3.5 py-3 text-left text-xs",
                      query.sort === option.value
                        ? "bg-accent/5 text-accent font-semibold"
                        : "hover:bg-muted/40 text-foreground"
                    )}
                  >
                    {option.label}
                    {query.sort === option.value && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

