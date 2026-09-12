import { Link, useLocation } from 'react-router-dom';
import { useRegion } from '../../app/useRegion';
import { signInPath } from '../auth/signInPath';
import { useSession } from '../auth/useSession';
import type { MovieSnapshot } from './api';
import { useMovieEntry, useSaveEntry } from './queries';
import { nextFlags, type EntryFlags, type ListAction } from './toggle';

const BUTTONS: { action: ListAction; label: string }[] = [
  { action: 'favorite', label: 'Favorite' },
  { action: 'wishlist', label: 'Wishlist' },
  { action: 'watched', label: 'Watched' },
];

const BASE_CLASSES = 'rounded-full border px-4 py-1.5 text-sm';
const OFF_CLASSES = 'border-neutral-700 text-neutral-300 hover:bg-neutral-800';
const ON_CLASSES = 'border-neutral-100 bg-neutral-100 text-neutral-900';

function isOn(flags: EntryFlags | null, action: ListAction): boolean {
  if (!flags) return false;
  return action === 'favorite' ? flags.isFavorite : flags.status === action;
}

function Label({ action, label }: { action: ListAction; label: string }) {
  return (
    <>
      {/* Decorative: the accessible name stays exactly "Favorite". */}
      {action === 'favorite' && <span aria-hidden="true">♥ </span>}
      {label}
    </>
  );
}

export function ListButtons({ movie }: { movie: MovieSnapshot }) {
  const session = useSession();
  const location = useLocation();
  const { region } = useRegion();
  const entry = useMovieEntry(movie.id);
  const save = useSaveEntry(movie);

  if (session.status === 'signed-out') {
    // Visitors see the same three controls, so they learn the feature exists.
    // Each leads to sign-in and back to this page. Nothing is remembered:
    // after signing in, they press the button again.
    const href = signInPath(region, location.pathname + location.search);
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        {BUTTONS.map(({ action, label }) => (
          <Link key={action} to={href} className={`${BASE_CLASSES} ${OFF_CLASSES}`}>
            <Label action={action} label={label} />
          </Link>
        ))}
      </div>
    );
  }

  if (entry.isError) {
    // TMDB and Supabase are separate: the movie above still renders.
    return (
      <div role="alert" className="mt-4 flex items-center gap-3 text-sm text-neutral-300">
        Couldn't load your lists.
        <button type="button" onClick={() => void entry.refetch()} className="underline">
          Retry
        </button>
      </div>
    );
  }

  const flags = entry.data ?? null;
  // Disabled while the session or the entry is still loading, and while a save
  // is in flight. The new state appears only once the database confirms it,
  // so the screen never shows something that wasn't saved.
  const busy = session.status === 'loading' || entry.isPending || save.isPending;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {BUTTONS.map(({ action, label }) => {
          const on = isOn(flags, action);
          return (
            <button
              key={action}
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => save.mutate(nextFlags(flags, action))}
              className={`${BASE_CLASSES} ${on ? ON_CLASSES : OFF_CLASSES} disabled:opacity-50`}
            >
              <Label action={action} label={label} />
            </button>
          );
        })}
      </div>
      {save.isError && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          Couldn't save. Try again.
        </p>
      )}
    </div>
  );
}
