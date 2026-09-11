import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TmdbError } from '../api/client';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('gives a setup-specific message for 401', () => {
    render(
      <ErrorState error={new TmdbError(401, 'Invalid API key.')} onRetry={vi.fn()} />,
    );

    expect(screen.getByText(/VITE_TMDB_TOKEN/)).toBeInTheDocument();
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
