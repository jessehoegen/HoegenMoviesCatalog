import { Link } from 'react-router-dom';
import type { TmdbMovieSummary } from '../api/types';
import { Poster } from './Poster';

interface MovieCardProps {
  movie: TmdbMovieSummary;
  to: string;
}

export function MovieCard({ movie, to }: MovieCardProps) {
  const year = movie.release_date ? movie.release_date.slice(0, 4) : '—';

  return (
    <li>
      <Link to={to} className="group block focus:outline-none">
        <div className="relative">
          <Poster path={movie.poster_path} alt={movie.title} />
          <span className="absolute right-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white">
            {movie.vote_average.toFixed(1)}
          </span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-medium text-neutral-100 group-hover:underline group-focus-visible:underline">
          {movie.title}
        </h3>
        <p className="text-xs text-neutral-400">{year}</p>
      </Link>
    </li>
  );
}
