import type { TmdbGenre, TmdbMovieSummary, TmdbProvider, TmdbRegion } from '../api/types';

export const genresFixture: TmdbGenre[] = [
  { id: 28, name: 'Action' },
  { id: 35, name: 'Comedy' },
  { id: 99, name: 'Documentary' },
];

export const regionsFixture: TmdbRegion[] = [
  { iso_3166_1: 'NL', english_name: 'Netherlands', native_name: 'Netherlands' },
  {
    iso_3166_1: 'US',
    english_name: 'United States of America',
    native_name: 'United States',
  },
];

export const providersFixture: TmdbProvider[] = [
  {
    provider_id: 8,
    provider_name: 'Netflix',
    logo_path: '/netflix.jpg',
    display_priority: 0,
  },
  {
    provider_id: 337,
    provider_name: 'Disney Plus',
    logo_path: '/disney.jpg',
    display_priority: 1,
  },
];

export function movieSummaryFixture(
  overrides: Partial<TmdbMovieSummary> = {},
): TmdbMovieSummary {
  return {
    id: 550,
    title: 'Fight Club',
    overview: 'A ticking-time-bomb insomniac.',
    poster_path: '/poster.jpg',
    release_date: '1999-10-15',
    vote_average: 8.4,
    vote_count: 27000,
    ...overrides,
  };
}
