import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGenres, useProviders, useRegions } from '../../api/queries';
import {
  parseFilters,
  serialiseFilters,
  type BrowseFilters,
  DEFAULT_SORT,
} from '../../lib/filters';

export function useBrowseFilters(): {
  filters: BrowseFilters;
  updateFilters: (patch: Partial<BrowseFilters>) => void;
  clearFilters: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: regions } = useRegions();
  const { data: genres } = useGenres();

  const regionFromUrl = searchParams.get('region')?.toUpperCase();
  const { data: providers } = useProviders(regionFromUrl ?? '');

  const vocabulary = useMemo(
    () => ({
      supportedRegions: regions?.map((r) => r.iso_3166_1),
      validGenreIds: genres?.map((g) => g.id),
      validProviderIds: providers?.map((p) => p.provider_id),
    }),
    [regions, genres, providers],
  );

  const filters = useMemo(
    () => parseFilters(searchParams, vocabulary),
    [searchParams, vocabulary],
  );

  const updateFilters = useCallback(
    (patch: Partial<BrowseFilters>) => {
      setSearchParams(serialiseFilters({ ...filters, ...patch }));
    },
    [filters, setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(
      serialiseFilters({
        region: filters.region,
        providers: [],
        genres: [],
        sort: DEFAULT_SORT,
      }),
    );
  }, [filters.region, setSearchParams]);

  return { filters, updateFilters, clearFilters };
}
