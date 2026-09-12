export type ListStatus = 'wishlist' | 'watched';

/** A movie's place in one user's lists. Mirrors a movie_entries row's two flags. */
export interface EntryFlags {
  isFavorite: boolean;
  status: ListStatus | null;
}

export type ListAction = 'favorite' | 'wishlist' | 'watched';

/**
 * What pressing one button does. `null` in and out means "no entry": a null
 * result tells the caller to delete the row, because the table refuses an
 * entry with nothing set.
 *
 * Wishlist and watched share `status`, so pressing Watched on a wishlisted
 * movie replaces the status rather than adding a second one: the database's
 * "mutually exclusive" rule and this function agree by construction.
 */
export function nextFlags(current: EntryFlags | null, action: ListAction): EntryFlags | null {
  const flags = current ?? { isFavorite: false, status: null };

  const next: EntryFlags =
    action === 'favorite'
      ? { ...flags, isFavorite: !flags.isFavorite }
      : { ...flags, status: flags.status === action ? null : action };

  return next.isFavorite || next.status !== null ? next : null;
}
