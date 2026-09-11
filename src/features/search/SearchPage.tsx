import { useSearchParams } from 'react-router-dom';
import { flattenPages, useSearchMovies } from '../../api/useMovieList';
import { useRegion, withRegion } from '../../app/useRegion';
import { MovieGrid } from '../../components/MovieGrid';

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const { region } = useRegion();
  const query = searchParams.get('q')?.trim() ?? '';
  const results = useSearchMovies(query);

  if (query === '') {
    return (
      <p className="py-16 text-center text-neutral-400">
        Type a movie title in the search box above.
      </p>
    );
  }

  return (
    <>
      <h1 className="mb-6 text-lg text-neutral-300">
        Results for <span className="font-semibold text-neutral-100">{query}</span>
      </h1>

      {/* Search is global: TMDB's /search/movie accepts no provider filters, so
          streaming availability only appears on the detail page. */}
      <MovieGrid
        movies={flattenPages(results.data)}
        status={results.status}
        error={results.error}
        hasNextPage={results.hasNextPage}
        isFetchingNextPage={results.isFetchingNextPage}
        onLoadMore={() => void results.fetchNextPage()}
        onRetry={() => void results.refetch()}
        linkFor={(movie) => withRegion(`/movie/${movie.id}`, region)}
      />
    </>
  );
}
