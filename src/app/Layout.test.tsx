import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route, useLocation } from 'react-router-dom';
import { server } from '../test/server';
import { regionsFixture } from '../test/fixtures';
import { renderWithProviders } from '../test/utils';
import { Layout } from './Layout';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderShell(route: string) {
  server.use(
    http.get('https://api.themoviedb.org/3/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );

  return renderWithProviders(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/browse" element={<LocationProbe />} />
        <Route path="/search" element={<LocationProbe />} />
      </Route>
    </Routes>,
    { route },
  );
}

describe('Layout', () => {
  it('changes the region in the URL without leaving the route', async () => {
    renderShell('/browse?region=NL');

    // Wait for the real region list to load, not just the single-option
    // fallback RegionPicker renders while `useRegions()` is pending — that
    // fallback's value already equals the URL region ('NL'), so asserting
    // on value alone would pass before the list (and its 'US' option) exists.
    await waitFor(() => expect(screen.getByLabelText(/region/i)).not.toBeDisabled());
    expect(screen.getByLabelText(/region/i)).toHaveValue('NL');

    await userEvent.selectOptions(screen.getByLabelText(/region/i), 'US');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/browse?region=US'),
    );
  });

  it('navigates to search carrying the region forward', async () => {
    renderShell('/browse?region=NL');

    await userEvent.type(screen.getByRole('searchbox'), 'blade runner');

    await waitFor(
      () => {
        const location = screen.getByTestId('location').textContent ?? '';
        expect(location).toContain('/search');
        expect(location).toContain('q=blade+runner');
        expect(location).toContain('region=NL');
      },
      { timeout: 2000 },
    );
  });
});
