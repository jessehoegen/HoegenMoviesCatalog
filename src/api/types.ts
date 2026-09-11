export interface TmdbPage<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbMovieSummary {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  /** ISO date, e.g. "2019-05-24". Can be an empty string for unreleased titles. */
  release_date: string;
  vote_average: number;
  vote_count: number;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
}

export interface TmdbRegion {
  iso_3166_1: string;
  english_name: string;
  native_name: string;
}

/** One region's entry in a /movie/{id}/watch/providers response. */
export interface TmdbRegionProviders {
  link: string;
  flatrate?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
}

export interface TmdbWatchProviders {
  /** Keyed by ISO 3166-1 region code, e.g. "NL". */
  results: Record<string, TmdbRegionProviders | undefined>;
}

export interface TmdbMovieDetail extends TmdbMovieSummary {
  backdrop_path: string | null;
  runtime: number | null;
  genres: TmdbGenre[];
  'watch/providers'?: TmdbWatchProviders;
}

export interface TmdbErrorBody {
  status_code?: number;
  status_message?: string;
}
