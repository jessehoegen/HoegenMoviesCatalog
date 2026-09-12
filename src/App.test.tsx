import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { server } from './test/server';
import { regionsFixture } from './test/fixtures';
import { signedIn } from './test/auth';
import { restUrl } from './test/supabase';
import { renderWithProviders } from './test/utils';
import App from './App';

describe('App routing', () => {
  it('keeps the header and offers a way back on an unmatched path', () => {
    server.use(
      http.get('/api/tmdb/watch/providers/regions', () =>
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

  it('serves the sign-in page inside the layout', () => {
    server.use(
      http.get('/api/tmdb/watch/providers/regions', () =>
        HttpResponse.json({ results: regionsFixture }),
      ),
    );

    renderWithProviders(<App />, { route: '/sign-in?region=NL' });

    expect(screen.getByRole('link', { name: /streaming catalog/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('serves My lists inside the layout', async () => {
    server.use(
      http.get('/api/tmdb/watch/providers/regions', () =>
        HttpResponse.json({ results: regionsFixture }),
      ),
      http.get(restUrl('movie_entries'), () => HttpResponse.json([])),
    );

    renderWithProviders(<App />, { route: '/lists?region=NL', auth: signedIn });

    expect(await screen.findByRole('heading', { name: 'My lists' })).toBeInTheDocument();
  });

  it('serves the account page inside the layout', () => {
    server.use(
      http.get('/api/tmdb/watch/providers/regions', () =>
        HttpResponse.json({ results: regionsFixture }),
      ),
    );

    renderWithProviders(<App />, { route: '/account?region=NL', auth: signedIn });

    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
  });
});
