import { TmdbError } from '../api/client';

interface ErrorStateProps {
  error: unknown;
  onRetry: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  // A 401 means the server's TMDB token is missing or wrong. A visitor can do
  // nothing about that, so say so plainly, and tell the operator where the
  // token lives.
  if (error instanceof TmdbError && error.status === 401) {
    return (
      <div className="py-16 text-center">
        <p className="text-neutral-300">
          Movie data is unavailable because this site is misconfigured. This isn't
          something you can fix from here.
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          Site owner: set <code className="text-neutral-300">TMDB_TOKEN</code> in the
          Vercel project's environment variables, then redeploy.
        </p>
      </div>
    );
  }

  const isNetworkFailure = !(error instanceof TmdbError);
  const message = isNetworkFailure
    ? 'Could not reach TMDB — check your connection.'
    : (error as TmdbError).message;

  return (
    <div className="py-16 text-center">
      <p className="text-neutral-300">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white"
      >
        Try again
      </button>
    </div>
  );
}
