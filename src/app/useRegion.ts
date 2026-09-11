import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRegions } from '../api/queries';
import { defaultRegion } from '../features/browse/filters';

export function withRegion(
  path: string,
  region: string,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams({ ...extra, region });
  return `${path}?${params.toString()}`;
}

/**
 * Region lives in the URL on every route rather than in a context provider, so
 * a shared link resolves to the same streaming availability for the recipient.
 */
export function useRegion(): { region: string; setRegion: (next: string) => void } {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: regions } = useRegions();

  const supported = regions?.map((r) => r.iso_3166_1);
  const fromUrl = searchParams.get('region')?.toUpperCase();
  const isValid = fromUrl !== undefined && (!supported || supported.includes(fromUrl));

  const region = isValid ? fromUrl : defaultRegion(navigator.language, supported);

  const setRegion = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams);
      params.set('region', next);
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  return { region, setRegion };
}
