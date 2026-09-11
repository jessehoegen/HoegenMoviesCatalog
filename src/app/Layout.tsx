import { Link, Outlet } from 'react-router-dom';
import { HeaderSearch } from './HeaderSearch';
import { RegionPicker } from './RegionPicker';
import { useRegion, withRegion } from './useRegion';

export function Layout() {
  const { region } = useRegion();

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
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
