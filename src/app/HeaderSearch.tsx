import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRegion, withRegion } from './useRegion';

const DEBOUNCE_MS = 300;

/**
 * A navigation control, not a stateful one: it pushes `q` into the URL and the
 * search page reads it from there, which keeps results shareable.
 */
export function HeaderSearch() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { region } = useRegion();
  const queryInUrl = searchParams.get('q') ?? '';
  const [value, setValue] = useState(queryInUrl);
  // The last query this component itself pushed into the URL. Any other change
  // to `q` — a shared link, Back, or simply leaving /search for a route that
  // has no `q` — belongs to somebody else and must flow into the input rather
  // than back out of it.
  const lastPushed = useRef(queryInUrl);

  useEffect(() => {
    if (queryInUrl === lastPushed.current) return;
    lastPushed.current = queryInUrl;
    setValue(queryInUrl);
  }, [queryInUrl]);

  // Navigation is driven by typing, never by a route change. This component
  // renders inside Layout and so survives every navigation; an effect that
  // also woke on route changes dragged the user straight back to /search from
  // wherever they had gone, because the retained input value no longer matched
  // the (absent) `q` of the new route.
  useEffect(() => {
    const trimmed = value.trim();
    // Clearing the input is not a navigation: there is nothing to search for,
    // and wiping `q` out of the URL would throw away results the user is
    // still looking at.
    if (trimmed === '' || trimmed === lastPushed.current) return;

    const timer = setTimeout(() => {
      lastPushed.current = trimmed;
      navigate(withRegion('/search', region, { q: trimmed }));
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, region, navigate]);

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
