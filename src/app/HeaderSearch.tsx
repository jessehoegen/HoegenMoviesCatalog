import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRegion } from './useRegion';

const DEBOUNCE_MS = 300;

/**
 * A navigation control, not a stateful one: it pushes `q` into the URL and the
 * search page reads it from there, which keeps results shareable.
 */
export function HeaderSearch() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { region } = useRegion();
  const [value, setValue] = useState(searchParams.get('q') ?? '');

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === (searchParams.get('q') ?? '')) return;

    const timer = setTimeout(() => {
      if (trimmed === '') return;
      const params = new URLSearchParams({ q: trimmed, region });
      navigate(`/search?${params.toString()}`);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, region, navigate, searchParams]);

  return (
    <input
      type="search"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder="Search movies…"
      aria-label="Search movies"
      className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500"
    />
  );
}
