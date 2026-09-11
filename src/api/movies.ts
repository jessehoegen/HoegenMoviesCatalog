import { tmdbFetch, type TmdbParams } from './client';
import type {
  TmdbGenre,
  TmdbMovieSummary,
  TmdbPage,
  TmdbProvider,
  TmdbRegion,
} from './types';

export async function fetchGenres(): Promise<TmdbGenre[]> {
  const data = await tmdbFetch<{ genres: TmdbGenre[] }>('/genre/movie/list');
  return data.genres;
}

export async function fetchRegions(): Promise<TmdbRegion[]> {
  const data = await tmdbFetch<{ results: TmdbRegion[] }>('/watch/providers/regions');
  return [...data.results].sort((a, b) => a.english_name.localeCompare(b.english_name));
}

export async function fetchProviders(region: string): Promise<TmdbProvider[]> {
  const data = await tmdbFetch<{ results: TmdbProvider[] }>('/watch/providers/movie', {
    watch_region: region,
  });
  return [...data.results].sort((a, b) => a.display_priority - b.display_priority);
}

export function fetchDiscover(params: TmdbParams): Promise<TmdbPage<TmdbMovieSummary>> {
  return tmdbFetch<TmdbPage<TmdbMovieSummary>>('/discover/movie', params);
}

export function fetchSearch(
  query: string,
  page: number,
): Promise<TmdbPage<TmdbMovieSummary>> {
  return tmdbFetch<TmdbPage<TmdbMovieSummary>>('/search/movie', { query, page });
}
