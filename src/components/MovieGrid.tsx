import type { TmdbMovieSummary } from '../api/types';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadMoreButton } from './LoadMoreButton';
import { MovieCard } from './MovieCard';

export interface MovieGridProps {
  movies: TmdbMovieSummary[];
  status: 'pending' | 'error' | 'success';
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onClearFilters?: () => void;
  linkFor: (movie: TmdbMovieSummary) => string;
}

const GRID_CLASSES =
  'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

function GridSkeleton() {
  return (
    <div className={GRID_CLASSES} data-testid="grid-skeleton" aria-busy="true">
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index}>
          {/* Skeletons match the card shape so the layout does not jump. */}
          <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-neutral-800" />
          <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-neutral-800" />
        </div>
      ))}
    </div>
  );
}

export function MovieGrid({
  movies,
  status,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onRetry,
  onClearFilters,
  linkFor,
}: MovieGridProps) {
  if (status === 'pending') return <GridSkeleton />;
  if (status === 'error') return <ErrorState error={error} onRetry={onRetry} />;
  if (movies.length === 0) return <EmptyState onClearFilters={onClearFilters} />;

  return (
    <>
      <ul className={GRID_CLASSES}>
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} to={linkFor(movie)} />
        ))}
      </ul>

      {hasNextPage ? (
        <LoadMoreButton onLoadMore={onLoadMore} isFetching={isFetchingNextPage} />
      ) : (
        <p className="py-8 text-center text-sm text-neutral-500">End of results.</p>
      )}
    </>
  );
}
