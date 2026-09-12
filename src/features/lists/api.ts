import type { TmdbMovieSummary } from '../../api/types';
import { supabase } from '../../lib/supabase';
import type { EntryFlags, ListStatus } from './toggle';

// The only module that reads or writes movie_entries. Row-level security
// already limits every request to the signed-in user's rows; the explicit
// user_id filters below say so in the code as well.

/**
 * A failed request to Supabase's database API. `status` is the HTTP status,
 * or 0 when no response arrived (network failure, or a paused project).
 */
export class ListsError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message || `Request failed (${status})`);
    this.name = 'ListsError';
    this.status = status;
  }
}

/**
 * A movie_entries row as PostgREST returns it. Typed by hand to match the
 * migration: generating types from the schema needs the Supabase CLI.
 */
export interface MovieEntryRow {
  user_id: string;
  movie_id: number;
  is_favorite: boolean;
  status: ListStatus | null;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  updated_at: string;
}

type FlagsRow = Pick<MovieEntryRow, 'is_favorite' | 'status'>;

/** The movie details copied into an entry, so the lists page needs no TMDB calls. */
export type MovieSnapshot = Pick<
  TmdbMovieSummary,
  'id' | 'title' | 'poster_path' | 'release_date' | 'vote_average'
>;

const TABLE = 'movie_entries';

function toFlags(row: FlagsRow): EntryFlags {
  return { isFavorite: row.is_favorite, status: row.status };
}

export async function fetchEntryFlags(userId: string, movieId: number): Promise<EntryFlags | null> {
  const { data, error, status } = await supabase
    .from(TABLE)
    .select('is_favorite, status')
    .eq('user_id', userId)
    .eq('movie_id', movieId);

  if (error) throw new ListsError(status, error.message);
  const row = (data as FlagsRow[])[0];
  return row ? toFlags(row) : null;
}

export async function fetchAllEntries(userId: string): Promise<MovieEntryRow[]> {
  const { data, error, status } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new ListsError(status, error.message);
  return data as MovieEntryRow[];
}

/**
 * Stores the result of nextFlags(): upserts the entry, refreshing the copied
 * movie details, or deletes it when `flags` is null. Returns what the
 * database now holds, which is what the buttons then show.
 */
export async function saveEntry(
  userId: string,
  movie: MovieSnapshot,
  flags: EntryFlags | null,
): Promise<EntryFlags | null> {
  if (flags === null) {
    const { error, status } = await supabase
      .from(TABLE)
      .delete()
      .eq('user_id', userId)
      .eq('movie_id', movie.id);

    if (error) throw new ListsError(status, error.message);
    return null;
  }

  const { data, error, status } = await supabase
    .from(TABLE)
    .upsert(
      {
        user_id: userId,
        movie_id: movie.id,
        is_favorite: flags.isFavorite,
        status: flags.status,
        title: movie.title,
        poster_path: movie.poster_path,
        // TMDB sends "" for an unknown release date; the table stores null.
        release_date: movie.release_date || null,
        vote_average: movie.vote_average,
      },
      // Insert, or update the existing row for this user and movie.
      { onConflict: 'user_id,movie_id' },
    )
    .select('is_favorite, status');

  if (error) throw new ListsError(status, error.message);
  return toFlags((data as FlagsRow[])[0]);
}

/** Shapes a row like the TMDB summaries MovieCard already knows how to display. */
export function entryToMovieSummary(row: MovieEntryRow): TmdbMovieSummary {
  return {
    id: row.movie_id,
    title: row.title,
    overview: '',
    poster_path: row.poster_path,
    release_date: row.release_date ?? '',
    vote_average: row.vote_average ?? 0,
    vote_count: 0,
  };
}
