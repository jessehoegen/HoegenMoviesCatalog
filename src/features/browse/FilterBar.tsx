import { useState } from 'react';
import { useGenres, useProviders } from '../../api/queries';
import { logoUrl } from '../../lib/images';
import { SORT_OPTIONS, type BrowseFilters, type SortOption } from '../../lib/filters';

interface FilterBarProps {
  filters: BrowseFilters;
  updateFilters: (patch: Partial<BrowseFilters>) => void;
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
          <label className="text-sm text-neutral-400">
            <span className="mb-1 block">From year</span>
            <input
              type="number"
              value={filters.from ?? ''}
              min={1874}
              onChange={(event) =>
                updateFilters({
                  from:
                    event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
              className="w-24 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
            />
          </label>

          <label className="text-sm text-neutral-400">
            <span className="mb-1 block">To year</span>
            <input
              type="number"
              value={filters.to ?? ''}
              min={1874}
              onChange={(event) =>
                updateFilters({
                  to: event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
              className="w-24 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
            />
          </label>

          <label className="text-sm text-neutral-400">
            <span className="mb-1 block">Min rating</span>
            <input
              type="number"
              value={filters.rating ?? ''}
              min={0}
              max={10}
              step={0.5}
              onChange={(event) =>
                updateFilters({
                  rating:
                    event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
              className="w-24 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
            />
          </label>

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
