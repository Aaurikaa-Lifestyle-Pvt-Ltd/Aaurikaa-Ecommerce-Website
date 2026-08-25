/** Route-level pending UI while the PDP resolves. */
export default function ProductLoading() {
  return (
    <div
      className="pb-24 pt-6 sm:pt-8 lg:pb-16 lg:pt-10"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-5 lg:px-6 xl:px-8">
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <div className="h-3 w-10 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2 animate-pulse rounded bg-muted" />
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2 animate-pulse rounded bg-muted" />
          <div className="h-3 w-28 animate-pulse rounded bg-muted" />
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] xl:gap-10">
          <div className="flex flex-col gap-3">
            <div className="aspect-[4/5] animate-pulse rounded-card bg-muted lg:hidden" />
            <div className="hidden lg:flex lg:items-stretch lg:gap-2.5">
              <div className="flex w-14 shrink-0 flex-col gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square animate-pulse rounded-control bg-muted"
                  />
                ))}
              </div>
              <div className="min-w-0 flex-1 aspect-[4/5] animate-pulse rounded-card bg-muted" />
            </div>
          </div>

          <div className="min-w-0 space-y-5">
            <div className="h-5 w-16 animate-pulse rounded bg-muted" />
            <div className="h-10 w-3/4 max-w-md animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-6 w-32 animate-pulse rounded bg-muted" />
            <div className="space-y-2 pt-2">
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
            </div>
            <div className="pt-4">
              <div className="mb-3 h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-11 w-36 animate-pulse rounded-control bg-muted" />
            </div>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <div className="h-12 flex-1 animate-pulse rounded-control bg-muted" />
              <div className="h-12 flex-1 animate-pulse rounded-control bg-muted" />
            </div>
          </div>
        </div>

        <span className="sr-only">Loading product</span>
      </div>
    </div>
  );
}
