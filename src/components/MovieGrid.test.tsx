import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import { movieSummaryFixture } from '../test/fixtures';
import { MovieGrid } from './MovieGrid';

const baseProps = {
  movies: [],
  status: 'success' as const,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  onLoadMore: vi.fn(),
  onRetry: vi.fn(),
  linkFor: (movie: { id: number }) => `/movie/${movie.id}?region=NL`,
};

describe('MovieGrid', () => {
  it('renders skeleton placeholders while pending', () => {
    renderWithProviders(<MovieGrid {...baseProps} status="pending" />);

    expect(screen.getByTestId('grid-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders an empty state with a clear-filters action', async () => {
    const onClearFilters = vi.fn();
    renderWithProviders(
      <MovieGrid {...baseProps} movies={[]} onClearFilters={onClearFilters} />,
    );

    expect(screen.getByText(/no movies match these filters/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it('renders an error state with a retry action', async () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <MovieGrid
        {...baseProps}
        status="error"
        error={new Error('network down')}
        onRetry={onRetry}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders movie cards linking to the detail route', () => {
    renderWithProviders(<MovieGrid {...baseProps} movies={[movieSummaryFixture()]} />);

    const link = screen.getByRole('link', { name: /fight club/i });
    expect(link).toHaveAttribute('href', '/movie/550?region=NL');
    expect(screen.getByText('1999')).toBeInTheDocument();
    expect(screen.getByText('8.4')).toBeInTheDocument();
    expect(screen.getByLabelText(/rating 8\.4 out of 10/i)).toBeInTheDocument();
  });

  it('shows a load-more button when another page exists', () => {
    renderWithProviders(
      <MovieGrid {...baseProps} movies={[movieSummaryFixture()]} hasNextPage />,
    );

    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
    expect(screen.queryByText(/end of results/i)).not.toBeInTheDocument();
  });

  it('shows an end marker when no further pages exist', () => {
    renderWithProviders(
      <MovieGrid {...baseProps} movies={[movieSummaryFixture()]} hasNextPage={false} />,
    );

    expect(screen.getByText(/end of results/i)).toBeInTheDocument();
  });
});
