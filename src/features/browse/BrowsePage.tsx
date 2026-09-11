import { useGenres, useProviders } from '../../api/queries';
import { withRegion } from '../../app/useRegion';
import { MovieGrid } from '../../components/MovieGrid';
import { FilterBar } from './FilterBar';
import { useBrowseFilters } from './useBrowseFilters';
import { flattenPages, useDiscoverMovies } from '../../api/useMovieList';

export function BrowsePage() {
  const { filters, updateFilters, clearFilters } = useBrowseFilters();
  const { data: genres } = useGenres();
  const { data: providers } = useProviders(filters.region);
  const query = useDiscoverMovies(filters);

  const chips = [
    ...filters.genres.map((id) => ({
      key: `genre-${id}`,
      label: genres?.find((genre) => genre.id === id)?.name ?? `Genre ${id}`,
      remove: () => updateFilters({ genres: filters.genres.filter((g) => g !== id) }),
    })),
    ...filters.providers.map((id) => ({
      key: `provider-${id}`,
      label:
        providers?.find((provider) => provider.provider_id === id)?.provider_name ??
        `Provider ${id}`,
      remove: () => updateFilters({ providers: filters.providers.filter((p) => p !== id) }),
    })),
    ...(filters.rating !== undefined
      ? [
          {
            key: 'rating',
            label: `Rating ≥ ${filters.rating}`,
            remove: () => updateFilters({ rating: undefined }),
          },
        ]
      : []),
  ];

  return (
    <>
      <FilterBar filters={filters} updateFilters={updateFilters} />

      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.remove}
              aria-label={`Remove ${chip.label}`}
              className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-200"
            >
              {chip.label} ×
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-neutral-400 underline"
          >
            Clear all filters
          </button>
        </div>
      )}

      <MovieGrid
        movies={flattenPages(query.data)}
        status={query.status}
        error={query.error}
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        onRetry={() => void query.refetch()}
        onClearFilters={clearFilters}
        linkFor={(movie) => withRegion(`/movie/${movie.id}`, filters.region)}
      />
    </>
  );
}
