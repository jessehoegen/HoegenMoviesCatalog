import type { TmdbMovieDetail } from '../../api/types';
import { logoUrl } from '../../lib/images';

interface ProviderListProps {
  movie: TmdbMovieDetail;
  region: string;
}

export function ProviderList({ movie, region }: ProviderListProps) {
  const flatrate = movie['watch/providers']?.results[region]?.flatrate ?? [];

  if (flatrate.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        Not streaming on any subscription service in {region}.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-3">
      {flatrate.map((provider) => {
        const logo = logoUrl(provider.logo_path, 'w92');
        return (
          <li
            key={provider.provider_id}
            className="flex items-center gap-2 rounded-md border border-neutral-800 px-3 py-2 text-sm text-neutral-200"
          >
            {logo && <img src={logo} alt="" className="h-6 w-6 rounded" />}
            {provider.provider_name}
          </li>
        );
      })}
    </ul>
  );
}
