import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGenres, useProviders, useRegions } from '../../api/queries';
import {
  parseFilters,
  resolveRegion,
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

  const supportedRegions = useMemo(() => regions?.map((r) => r.iso_3166_1), [regions]);
  // The resolved region, not the raw param: a missing or unsupported
  // `?region=` would otherwise leave the providers query disabled, and with no
  // provider list there is nothing to validate provider ids in the URL against.
  const region = resolveRegion(searchParams.get('region'), supportedRegions);
  const { data: providers } = useProviders(region);

  const vocabulary = useMemo(
    () => ({
      supportedRegions,
      validGenreIds: genres?.map((g) => g.id),
      validProviderIds: providers?.map((p) => p.provider_id),
    }),
    [supportedRegions, genres, providers],
  );

  const filters = useMemo(
    () => parseFilters(searchParams, vocabulary),
    [searchParams, vocabulary],
  );

  // Region belongs in the URL on every route: the landing redirect arrives
  // with no query string at all, and a stale or unsupported `?region=` would
  // keep the address bar describing a catalog nobody is looking at. Copying
  // the link then hands the recipient a different catalog, which is exactly
  // what URL-as-state exists to prevent. `replace` so canonicalising costs no
  // history entry and Back still leaves the app.
  useEffect(() => {
    if ((searchParams.get('region') ?? '').toUpperCase() === filters.region) return;
    setSearchParams(serialiseFilters(filters), { replace: true });
  }, [searchParams, filters, setSearchParams]);

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
