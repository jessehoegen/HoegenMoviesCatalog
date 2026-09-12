import { Link, Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { HeaderSearch } from './HeaderSearch';
import { RegionPicker } from './RegionPicker';
import { useRegion, withRegion } from './useRegion';
import { AccountNav } from './AccountNav';

export function Layout() {
  const { region } = useRegion();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to={withRegion('/browse', region)} className="text-lg font-semibold">
            Streaming Catalog
          </Link>
          <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
            <HeaderSearch />
          </div>
          <RegionPicker />
          <AccountNav region={region} />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {/*
          The boundary sits around the page, not around the whole app: a render
          crash must not take the header and its navigation with it. Keyed by
          pathname so that navigating away actually clears the error, rather
          than leaving a "Try again" button that re-renders the same broken
          subtree. The search string is deliberately not part of the key —
          changing a filter must not remount the grid.
        */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
