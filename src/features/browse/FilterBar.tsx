import { useCallback, useEffect, useState } from 'react';
import { useGenres, useProviders } from '../../api/queries';
import { logoUrl } from '../../lib/images';
import {
  MIN_YEAR,
  SORT_OPTIONS,
  maxYear,
  type BrowseFilters,
  type SortOption,
} from '../../lib/filters';

interface FilterBarProps {
  filters: BrowseFilters;
  updateFilters: (patch: Partial<BrowseFilters>) => void;
}

const COMMIT_DEBOUNCE_MS = 500;

const RATING_MIN = 0;
const RATING_MAX = 10;

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
  onCommit: (next: number | undefined) => void;
}

function toText(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

/**
 * A numeric filter input whose raw text lives in local state and reaches the
 * URL only on blur, on Enter, or after a pause.
 *
 * Writing every keystroke straight to the URL erases partial input: typing
 * '2010' passes through 2, 20 and 201, each of which the filter parser rejects
 * as out of range, so the value read back is `undefined` and React restores the
 * controlled input to empty after every single key. Only values the parser will
 * actually keep are committed, so the URL never carries a nonsense `?from=0`.
 */
function NumberField({
  label,
  value,
  min,
  max,
  step,
  integer = false,
  onCommit,
}: NumberFieldProps) {
  const [text, setText] = useState(() => toText(value));
  const [applied, setApplied] = useState(value);

  // The applied filter is the authority. When it changes underneath the field
  // — "Clear all filters", a chip removed, a shared link — the text resets to
  // it. While the user is typing the filter does not change, so this never
  // eats a keystroke. Adjusting state during render is React's own
  // recommendation for resetting local state from a prop, and avoids the extra
  // paint an effect would cost.
  if (value !== applied) {
    setApplied(value);
    setText(toText(value));
  }

  const parse = useCallback(
    (raw: string): { valid: boolean; value?: number } => {
      if (raw.trim() === '') return { valid: true, value: undefined };
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return { valid: false };
      if (parsed < min || parsed > max) return { valid: false };
      if (integer && !Number.isInteger(parsed)) return { valid: false };
      return { valid: true, value: parsed };
    },
    [min, max, integer],
  );

  // A pause commits too, so the spinner arrows work without the user having to
  // blur the field. The cleanup cancels the pending commit whenever the text
  // changes again or the filter changes underneath it, so nothing half-typed
  // and nothing already withdrawn ever reaches the URL.
  useEffect(() => {
    if (text === toText(value)) return;

    const timer = setTimeout(() => {
      const parsed = parse(text);
      if (parsed.valid && parsed.value !== value) onCommit(parsed.value);
    }, COMMIT_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [text, value, parse, onCommit]);

  function commitOrRevert() {
    const parsed = parse(text);
    // Input the parser would throw away is discarded rather than written to
    // the URL, so the field never shows a filter that is not actually applied.
    if (!parsed.valid) {
      setText(toText(value));
      return;
    }
    if (parsed.value !== value) onCommit(parsed.value);
  }

  return (
    <label className="text-sm text-neutral-400">
      <span className="mb-1 block">{label}</span>
      <input
        type="number"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(event) => setText(event.target.value)}
        onBlur={commitOrRevert}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commitOrRevert();
        }}
        className="w-24 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
      />
    </label>
  );
}

const SORT_LABELS: Record<SortOption, string> = {
  'popularity.desc': 'Most popular',
  'popularity.asc': 'Least popular',
  'vote_average.desc': 'Highest rated',
  'vote_average.asc': 'Lowest rated',
  'primary_release_date.desc': 'Newest first',
  'primary_release_date.asc': 'Oldest first',
  'title.asc': 'Title A–Z',
  'title.desc': 'Title Z–A',
};

function toggleId(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function FilterBar({ filters, updateFilters }: FilterBarProps) {
  const { data: genres } = useGenres();
  const { data: providers } = useProviders(filters.region);
  const [isOpen, setIsOpen] = useState(false);

  // Stable identities: each one is a dependency of a NumberField's debounce,
  // and a fresh callback on every render would restart the timer instead of
  // letting it fire.
  const commitFrom = useCallback(
    (from: number | undefined) => updateFilters({ from }),
    [updateFilters],
  );
  const commitTo = useCallback(
    (to: number | undefined) => updateFilters({ to }),
    [updateFilters],
  );
  const commitRating = useCallback(
    (rating: number | undefined) => updateFilters({ rating }),
    [updateFilters],
  );

  return (
    <section className="mb-6">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="mb-3 rounded-md border border-neutral-700 px-3 py-1.5 text-sm md:hidden"
      >
        Filters
      </button>

      <div className={`${isOpen ? 'block' : 'hidden'} space-y-4 md:block`}>
        <fieldset>
          <legend className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
            Providers
          </legend>
          <div className="flex flex-wrap gap-2">
            {(providers ?? []).slice(0, 16).map((provider) => {
              const active = filters.providers.includes(provider.provider_id);
              const logo = logoUrl(provider.logo_path, 'w45');
              return (
                <button
                  key={provider.provider_id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    updateFilters({
                      providers: toggleId(filters.providers, provider.provider_id),
                    })
                  }
                  className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm ${
                    active
                      ? 'border-neutral-100 bg-neutral-100 text-neutral-900'
                      : 'border-neutral-700 text-neutral-300'
                  }`}
                >
                  {logo && <img src={logo} alt="" className="h-5 w-5 rounded" />}
                  {provider.provider_name}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
            Genres
          </legend>
          <div className="flex flex-wrap gap-2">
            {(genres ?? []).map((genre) => {
              const active = filters.genres.includes(genre.id);
              return (
                <button
                  key={genre.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    updateFilters({ genres: toggleId(filters.genres, genre.id) })
                  }
                  className={`rounded-full border px-3 py-1 text-sm ${
                    active
                      ? 'border-neutral-100 bg-neutral-100 text-neutral-900'
                      : 'border-neutral-700 text-neutral-300'
                  }`}
                >
                  {genre.name}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-end gap-4">
          <NumberField
            label="From year"
            value={filters.from}
            min={MIN_YEAR}
            max={maxYear()}
            integer
            onCommit={commitFrom}
          />

          <NumberField
            label="To year"
            value={filters.to}
            min={MIN_YEAR}
            max={maxYear()}
            integer
            onCommit={commitTo}
          />

          <NumberField
            label="Min rating"
            value={filters.rating}
            min={RATING_MIN}
            max={RATING_MAX}
            step={0.5}
            onCommit={commitRating}
          />

          <label className="text-sm text-neutral-400">
            <span className="mb-1 block">Sort by</span>
            <select
              value={filters.sort}
              onChange={(event) =>
                updateFilters({ sort: event.target.value as SortOption })
              }
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {SORT_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </section>
  );
}
