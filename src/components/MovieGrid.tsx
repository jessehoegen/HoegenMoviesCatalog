import type { ReactNode } from 'react';
import type { TmdbMovieSummary } from '../api/types';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadMoreButton } from './LoadMoreButton';
import { MovieCard } from './MovieCard';

interface MovieGridProps {
  movies: TmdbMovieSummary[];
  status: 'pending' | 'error' | 'success';
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** True when a page *after* the first failed; `status` stays 'success'. */
  isFetchNextPageError?: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onClearFilters?: () => void;
  /** Replaces the browse empty state, which talks about filters. */
  emptyState?: ReactNode;
  /** For lists that are complete by nature, where "End of results." reads oddly. */
  hideEndOfResults?: boolean;
  linkFor: (movie: TmdbMovieSummary) => string;
}

const GRID_CLASSES =
  'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

function GridSkeleton() {
  return (
    <>
      {/*
        aria-busy alone is not reliably announced (WCAG 4.1.3), so a separate
        visually-hidden live region carries the loading announcement. It is a
        sibling of the skeleton grid, not wrapped around it — a status region
        wrapping twelve placeholder divs would announce their churn instead.
      */}
      <span role="status" aria-label="Loading movies…" className="sr-only">
        Loading movies…
      </span>
      <div className={GRID_CLASSES} data-testid="grid-skeleton" aria-busy="true">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index}>
            {/* Skeletons match the card shape so the layout does not jump. */}
            <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-neutral-800" />
            <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-neutral-800" />
          </div>
        ))}
      </div>
    </>
  );
}

function NextPageError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-sm text-neutral-300">
        Could not load more results. The rest of the list is still here.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-neutral-700 px-6 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
      >
        Retry
      </button>
    </div>
  );
}

export function MovieGrid({
  movies,
  status,
  error,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError = false,
  onLoadMore,
  onRetry,
  onClearFilters,
  emptyState,
  hideEndOfResults = false,
  linkFor,
}: MovieGridProps) {
  // `status` describes the first page only: a later page failing leaves it
  // 'success', which is why the next-page error is reported separately.
  if (status === 'pending') return <GridSkeleton />;
  if (status === 'error') return <ErrorState error={error} onRetry={onRetry} />;
  if (movies.length === 0) {
    return <>{emptyState ?? <EmptyState onClearFilters={onClearFilters} />}</>;
  }

  return (
    <>
      <ul className={GRID_CLASSES}>
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} to={linkFor(movie)} />
        ))}
      </ul>

      {!hasNextPage ? (
        hideEndOfResults ? null : (
          <p className="py-8 text-center text-sm text-neutral-500">End of results.</p>
        )
      ) : isFetchNextPageError ? (
        // LoadMoreButton is unmounted rather than disabled: its
        // IntersectionObserver would otherwise re-observe a sentinel that is
        // still on screen and fire the same failing request again, and again,
        // for as long as the user sat at the bottom of the grid. Recovery
        // takes an explicit click.
        <NextPageError onRetry={onLoadMore} />
      ) : (
        <LoadMoreButton onLoadMore={onLoadMore} isFetching={isFetchingNextPage} />
      )}
    </>
  );
}
