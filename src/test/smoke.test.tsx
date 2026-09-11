import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './utils';

describe('test infrastructure', () => {
  it('renders a component through the provider stack', () => {
    renderWithProviders(<h1>Movie Catalog</h1>);
    expect(screen.getByRole('heading', { name: 'Movie Catalog' })).toBeInTheDocument();
  });
});
