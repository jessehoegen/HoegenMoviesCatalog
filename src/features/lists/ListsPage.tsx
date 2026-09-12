import { Link, useSearchParams } from 'react-router-dom';
import { useRegion, withRegion } from '../../app/useRegion';
import { MovieGrid } from '../../components/MovieGrid';
import { SignInRedirect } from '../auth/SignInRedirect';
import { useSession } from '../auth/useSession';
import { entryToMovieSummary, type MovieEntryRow } from './api';
import { useMyEntries } from './queries';

interface TabConfig {
  tab: 'wishlist' | 'watched' | 'favorites';
  label: string;
  empty: string;
  includes: (row: MovieEntryRow) => boolean;
}

const TABS: TabConfig[] = [
  {
    tab: 'wishlist',
    label: 'Wishlist',
    empty: 'Nothing on your wishlist yet.',
    includes: (row) => row.status === 'wishlist',
  },
  {
    tab: 'watched',
    label: 'Watched',
    empty: 'Nothing marked as watched yet.',
    includes: (row) => row.status === 'watched',
  },
  {
    tab: 'favorites',
    label: 'Favorites',
    empty: 'No favorites yet.',
    includes: (row) => row.is_favorite,
  },
];

const TAB_CLASSES = 'rounded-full px-4 py-1.5 text-sm';
const ACTIVE_TAB_CLASSES = 'bg-neutral-100 text-neutral-900';
const INACTIVE_TAB_CLASSES = 'text-neutral-300 hover:bg-neutral-800';

export function ListsPage() {
  const session = useSession();
  const [searchParams] = useSearchParams();
  const { region } = useRegion();
  const entries = useMyEntries();

  if (session.status === 'loading') {
    return <div className="h-96 animate-pulse rounded-lg bg-neutral-900" />;
  }
  if (session.status === 'signed-out') {
    return <SignInRedirect />;
  }

  // The tab lives in the URL like all page state. Missing or unknown means
  // the wishlist.
  const current = TABS.find((item) => item.tab === searchParams.get('tab')) ?? TABS[0];
  // One query loads every entry; each tab is a filter over it, which also
  // gives the counts without extra requests.
  const rows = entries.data ?? [];

  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold">My lists</h1>

      <nav aria-label="Lists" className="mb-6 flex flex-wrap gap-2">
        {TABS.map((item) => {
          const active = item.tab === current.tab;
          return (
            <Link
              key={item.tab}
              to={withRegion('/lists', region, { tab: item.tab })}
              aria-current={active ? 'page' : undefined}
              className={`${TAB_CLASSES} ${active ? ACTIVE_TAB_CLASSES : INACTIVE_TAB_CLASSES}`}
            >
              {item.label}
              {entries.data && ` (${rows.filter(item.includes).length})`}
            </Link>
          );
        })}
      </nav>

      {/* Not ErrorState: its wording is about TMDB, and this is Supabase. */}
      {entries.isError ? (
        <div className="py-16 text-center">
          <p className="text-neutral-300">Couldn't load your lists.</p>
          <button
            type="button"
            onClick={() => void entries.refetch()}
            className="mt-4 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white"
          >
            Try again
          </button>
        </div>
      ) : (
        <MovieGrid
          movies={rows.filter(current.includes).map(entryToMovieSummary)}
          status={entries.isPending ? 'pending' : 'success'}
          error={null}
          hasNextPage={false}
          isFetchingNextPage={false}
          hideEndOfResults
          onLoadMore={() => {}}
          onRetry={() => void entries.refetch()}
          emptyState={
            <div className="py-16 text-center">
              <p className="text-neutral-300">{current.empty}</p>
              <Link
                to={withRegion('/browse', region)}
                className="mt-4 inline-block text-sm text-neutral-400 underline"
              >
                Browse the catalog
              </Link>
            </div>
          }
          linkFor={(movie) => withRegion(`/movie/${movie.id}`, region)}
        />
      )}
    </section>
  );
}
