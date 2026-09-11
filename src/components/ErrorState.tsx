import { TmdbError } from '../api/client';

interface ErrorStateProps {
  error: unknown;
  onRetry: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  // A 401 is a setup problem, not a runtime one. A generic "something went
  // wrong" here costs an hour on first run.
  if (error instanceof TmdbError && error.status === 401) {
    return (
      <div className="py-16 text-center">
        <p className="text-neutral-300">TMDB rejected the API token.</p>
        <p className="mt-1 text-sm text-neutral-500">
          Check that <code className="text-neutral-300">VITE_TMDB_TOKEN</code> is set in
          your <code className="text-neutral-300">.env</code> file, then restart the dev
          server.
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
