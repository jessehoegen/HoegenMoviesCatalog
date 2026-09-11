// TMDB documents fetching /configuration to discover this base URL and the
// valid size strings. The values are stable and hardcoded here deliberately,
// to avoid spending a request and a loading state on them.
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

export type PosterSize = 'w185' | 'w342' | 'w500';
export type BackdropSize = 'w780' | 'w1280';
export type LogoSize = 'w45' | 'w92';

function buildUrl(path: string | null, size: string): string | null {
  // TMDB paths already start with a slash.
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

export function posterUrl(path: string | null, size: PosterSize = 'w342'): string | null {
  return buildUrl(path, size);
}

export function backdropUrl(path: string | null, size: BackdropSize = 'w1280'): string | null {
  return buildUrl(path, size);
}

export function logoUrl(path: string | null, size: LogoSize = 'w92'): string | null {
  return buildUrl(path, size);
}
