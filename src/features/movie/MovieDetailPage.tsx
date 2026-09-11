import { useNavigate, useParams } from 'react-router-dom';
import { TmdbError } from '../../api/client';
import { useMovie } from '../../api/queries';
import { useRegion } from '../../app/useRegion';
import { ErrorState } from '../../components/ErrorState';
import { Poster } from '../../components/Poster';
import { backdropUrl } from '../../lib/images';
import { ProviderList } from './ProviderList';

function MovieNotFound() {
  return (
    <p className="py-16 text-center text-neutral-300">We could not find that movie.</p>
  );
}

export function MovieDetailPage() {
  const { id } = useParams();
  const { region } = useRegion();
  const navigate = useNavigate();
  const numericId = Number(id);
  const isValidId = Number.isInteger(numericId) && numericId > 0;
  // Hooks must run unconditionally; useMovie's own `enabled` guard keeps an
  // invalid id from firing a request. The early return below happens after.
  const query = useMovie(numericId);

  if (!isValidId) {
    return <MovieNotFound />;
  }

  if (query.isPending) {
    return <div className="h-96 animate-pulse rounded-lg bg-neutral-900" />;
  }

  if (query.isError) {
    if (query.error instanceof TmdbError && query.error.status === 404) {
      return <MovieNotFound />;
    }
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const movie = query.data;
  const backdrop = backdropUrl(movie.backdrop_path);
  const year = movie.release_date ? movie.release_date.slice(0, 4) : '—';

  return (
    <article>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 text-sm text-neutral-400 underline"
      >
        Back to results
      </button>

      {backdrop && (
        <img
          src={backdrop}
          alt=""
          className="mb-6 h-64 w-full rounded-lg object-cover opacity-60"
        />
      )}

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="w-40 shrink-0">
          <Poster path={movie.poster_path} alt={movie.title} size="w342" />
        </div>

        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{movie.title}</h1>

          <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-neutral-400">
            <span>{year}</span>
            {movie.runtime !== null && <span>{movie.runtime} min</span>}
            <span>{movie.vote_average.toFixed(1)} / 10</span>
          </p>

          <ul className="mt-3 flex flex-wrap gap-2">
            {movie.genres.map((genre) => (
              <li
                key={genre.id}
                className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-300"
              >
                {genre.name}
              </li>
            ))}
          </ul>

          <p className="mt-4 max-w-prose text-neutral-300">{movie.overview}</p>

          <h2 className="mt-8 mb-3 text-sm uppercase tracking-wide text-neutral-500">
            Streaming in {region}
          </h2>
          <ProviderList movie={movie} region={region} />
        </div>
      </div>
    </article>
  );
}
