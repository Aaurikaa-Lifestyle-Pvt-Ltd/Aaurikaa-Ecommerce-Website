import { Container } from "@/components/ui/container";

/** Route-level pending UI while search results resolve. */
export default function SearchLoading() {
  return (
    <div className="py-10 sm:py-14" aria-busy="true" aria-live="polite">
      <Container>
        <div className="mb-8 space-y-3">
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="h-9 w-64 max-w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
        <div className="mb-8 flex gap-3">
          <div className="h-9 w-24 animate-pulse rounded-control bg-muted" />
          <div className="h-9 w-24 animate-pulse rounded-control bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded-control bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="aspect-[3/4] animate-pulse rounded-card bg-muted" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <span className="sr-only">Loading search results</span>
      </Container>
    </div>
  );
}
