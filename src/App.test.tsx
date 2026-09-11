import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { server } from './test/server';
import { regionsFixture } from './test/fixtures';
import { renderWithProviders } from './test/utils';
import App from './App';

describe('App routing', () => {
  it('keeps the header and offers a way back on an unmatched path', () => {
    server.use(
      http.get('https://api.themoviedb.org/3/watch/providers/regions', () =>
        HttpResponse.json({ results: regionsFixture }),
      ),
    );

    // Without a catch-all inside the Layout route, a typo matched nothing and
    // Routes rendered null: a blank page with no header and no way back.
    renderWithProviders(<App />, { route: '/brwose' });

    expect(screen.getByRole('link', { name: /streaming catalog/i })).toBeInTheDocument();
    expect(screen.getByText(/that page does not exist/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to the catalog/i }).getAttribute('href'),
    ).toContain('/browse');
  });
});
