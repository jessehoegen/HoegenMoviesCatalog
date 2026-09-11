import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchGenres, fetchProviders, fetchRegions } from './movies';
import type { TmdbGenre, TmdbProvider, TmdbRegion } from './types';

// Regions, providers, and genres change a few times a year. Fetch once per
// session and never revalidate.
const REFERENCE_DATA = { staleTime: Infinity, gcTime: Infinity } as const;

export function useGenres(): UseQueryResult<TmdbGenre[]> {
  return useQuery({
    queryKey: ['genres'],
    queryFn: fetchGenres,
    ...REFERENCE_DATA,
  });
}

export function useRegions(): UseQueryResult<TmdbRegion[]> {
  return useQuery({
    queryKey: ['regions'],
    queryFn: fetchRegions,
    ...REFERENCE_DATA,
  });
}

export function useProviders(region: string): UseQueryResult<TmdbProvider[]> {
  return useQuery({
    queryKey: ['providers', region],
    queryFn: () => fetchProviders(region),
    enabled: region !== '',
    ...REFERENCE_DATA,
  });
}
