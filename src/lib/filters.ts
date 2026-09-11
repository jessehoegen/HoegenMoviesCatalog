import type { TmdbParams } from '../api/client';

export const SORT_OPTIONS = [
  'popularity.desc',
  'popularity.asc',
  'vote_average.desc',
  'vote_average.asc',
  'primary_release_date.desc',
  'primary_release_date.asc',
  'title.asc',
  'title.desc',
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number];

export const DEFAULT_SORT: SortOption = 'popularity.desc';
export const FALLBACK_REGION = 'US';
export const MIN_YEAR = 1874;
export const VOTE_COUNT_FLOOR = 100;

export interface BrowseFilters {
  region: string;
  providers: number[];
  genres: number[];
  from?: number;
  to?: number;
  rating?: number;
  sort: SortOption;
}

/**
 * Reference lists used to validate ids. Each field is optional because the
 * lists arrive asynchronously — while a list is undefined, ids of that kind
 * pass through unvalidated rather than being stripped, so a shared link is not
 * silently emptied during the first render.
 */
export interface FilterVocabulary {
  supportedRegions?: string[];
  validGenreIds?: number[];
  validProviderIds?: number[];
}

function maxYear(): number {
  return new Date().getFullYear() + 5;
}

function extractRegionSubtag(language: string | undefined): string | undefined {
  if (!language) return undefined;
  try {
    // Intl.Locale correctly separates the region subtag from a script subtag
    // (e.g. 'CN' from 'zh-Hans-CN'), unlike a naive split on '-'. Malformed
    // input throws, and this parses an untrusted URL-derived value, so any
    // throw is treated the same as "no region present".
    return new Intl.Locale(language).region;
  } catch {
    return undefined;
  }
}

export function defaultRegion(
  language: string | undefined,
  supported?: string[],
): string {
  const region = extractRegionSubtag(language)?.toUpperCase();
  if (!region) return FALLBACK_REGION;
  if (supported && !supported.includes(region)) return FALLBACK_REGION;
  return region;
}

function parseIdList(raw: string | null, validIds?: number[]): number[] {
  if (!raw) return [];

  const ids = raw
    .split('|')
    .map((part) => Number(part))
    .filter((id) => Number.isInteger(id) && id > 0);

  const unique = [...new Set(ids)];
  return validIds ? unique.filter((id) => validIds.includes(id)) : unique;
}

function parseNumberInRange(
  raw: string | null,
  min: number,
  max: number,
  integer = false,
): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return undefined;
  if (integer && !Number.isInteger(value)) return undefined;
  return value;
}

function parseSort(raw: string | null): SortOption {
  return SORT_OPTIONS.includes(raw as SortOption) ? (raw as SortOption) : DEFAULT_SORT;
}

export function parseFilters(
  params: URLSearchParams,
  vocabulary: FilterVocabulary = {},
  language: string | undefined = navigator.language,
): BrowseFilters {
  const rawRegion = params.get('region');
  // An empty '?region=' must be treated as absent, the same way parseIdList
  // treats an empty id list as absent — otherwise it bypasses default
  // substitution and region ends up '', violating the "region is never
  // empty" guarantee.
  const requestedRegion = rawRegion ? rawRegion.toUpperCase() : undefined;
  const regionIsValid =
    requestedRegion !== undefined &&
    (!vocabulary.supportedRegions ||
      vocabulary.supportedRegions.includes(requestedRegion));

  // Years must be whole numbers: they are spliced directly into an ISO date
  // string below, and a fractional year (e.g. 2010.5) would produce an
  // invalid date like '2010.5-01-01'.
  const from = parseNumberInRange(params.get('from'), MIN_YEAR, maxYear(), true);
  const to = parseNumberInRange(params.get('to'), MIN_YEAR, maxYear(), true);

  return {
    region: regionIsValid
      ? requestedRegion
      : defaultRegion(language, vocabulary.supportedRegions),
    providers: parseIdList(params.get('providers'), vocabulary.validProviderIds),
    genres: parseIdList(params.get('genres'), vocabulary.validGenreIds),
    from,
    // A range running backwards is meaningless; keep the start, drop the end.
    to: from !== undefined && to !== undefined && to < from ? undefined : to,
    rating: parseNumberInRange(params.get('rating'), 0, 10),
    sort: parseSort(params.get('sort')),
  };
}

export function serialiseFilters(filters: BrowseFilters): URLSearchParams {
  const params = new URLSearchParams();

  params.set('region', filters.region);
  if (filters.providers.length > 0) params.set('providers', filters.providers.join('|'));
  if (filters.genres.length > 0) params.set('genres', filters.genres.join('|'));
  if (filters.from !== undefined) params.set('from', String(filters.from));
  if (filters.to !== undefined) params.set('to', String(filters.to));
  if (filters.rating !== undefined) params.set('rating', String(filters.rating));
  if (filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort);

  return params;
}

export function toDiscoverParams(filters: BrowseFilters, page: number): TmdbParams {
  const params: TmdbParams = {
    page,
    sort_by: filters.sort,
    watch_region: filters.region,
    // Subscription streaming only. Without this, provider filters also match
    // rental and purchase availability.
    with_watch_monetization_types: 'flatrate',
  };

  if (filters.providers.length > 0) {
    params.with_watch_providers = filters.providers.join('|');
  }
  if (filters.genres.length > 0) {
    params.with_genres = filters.genres.join('|');
  }
  if (filters.from !== undefined) {
    params['primary_release_date.gte'] = `${filters.from}-01-01`;
  }
  if (filters.to !== undefined) {
    params['primary_release_date.lte'] = `${filters.to}-12-31`;
  }
  if (filters.rating !== undefined) {
    params['vote_average.gte'] = filters.rating;
    // Without a vote floor, a high rating threshold returns obscure titles
    // carrying a single 10/10 vote and the filter looks broken.
    params['vote_count.gte'] = VOTE_COUNT_FLOOR;
  }

  return params;
}
