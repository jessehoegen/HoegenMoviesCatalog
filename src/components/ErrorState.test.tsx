import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TmdbError } from '../api/client';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('tells a visitor the server is misconfigured on 401, and tells the operator where the token lives', () => {
    render(
      <ErrorState error={new TmdbError(401, 'Invalid API key.')} onRetry={vi.fn()} />,
    );

    // A visitor cannot fix a 401, so the message must not imply they can.
    expect(screen.getByText(/isn't something you can fix/i)).toBeInTheDocument();
    // The operator is pointed at the Vercel variable, not a local file.
    expect(screen.getByText(/TMDB_TOKEN/)).toBeInTheDocument();
    expect(screen.getByText(/Vercel/)).toBeInTheDocument();
    expect(screen.queryByText(/\.env/)).not.toBeInTheDocument();
    expect(screen.queryByText(/VITE_/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('offers retry for a server error', () => {
    render(
      <ErrorState error={new TmdbError(503, 'Service unavailable.')} onRetry={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('distinguishes a network failure from an API error', () => {
    render(<ErrorState error={new TypeError('Failed to fetch')} onRetry={vi.fn()} />);

    expect(screen.getByText(/check your connection/i)).toBeInTheDocument();
  });
});
