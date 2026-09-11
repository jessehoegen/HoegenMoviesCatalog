import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { server } from '../test/server';
import { regionsFixture } from '../test/fixtures';
import { renderWithProviders } from '../test/utils';
import { Layout } from './Layout';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

/** Long enough for the header's 300ms debounce to have fired if it were going to. */
function settleDebounce() {
  return act(() => new Promise((resolve) => setTimeout(resolve, 600)));
}

function SearchRoute() {
  const navigate = useNavigate();
  return (
    <>
      <LocationProbe />
      <Link to="/movie/550?region=NL">Fight Club</Link>
      <button type="button" onClick={() => navigate(-1)}>
        Go back
      </button>
    </>
  );
}

function mockRegions() {
  server.use(
    http.get('https://api.themoviedb.org/3/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );
}

function renderShell(route: string) {
  mockRegions();

  return renderWithProviders(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/browse" element={<LocationProbe />} />
        <Route path="/search" element={<SearchRoute />} />
        <Route path="/movie/:id" element={<LocationProbe />} />
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

  it('stays on the detail page after a search result is opened', async () => {
    renderShell('/search?q=batman&region=NL');

    // The header survives every navigation, so the query it was mounted with
    // is still in the input when the user leaves the search page.
    expect(screen.getByRole('searchbox')).toHaveValue('batman');

    await userEvent.click(screen.getByRole('link', { name: 'Fight Club' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/movie/550?region=NL');

    await settleDebounce();

    expect(screen.getByTestId('location')).toHaveTextContent('/movie/550?region=NL');
  });

  it('does not bounce forward to search again after going back', async () => {
    renderShell('/browse?region=NL');

    await userEvent.type(screen.getByRole('searchbox'), 'batman');
    await waitFor(
      () => expect(screen.getByTestId('location')).toHaveTextContent('/search'),
      { timeout: 2000 },
    );

    await userEvent.click(screen.getByRole('button', { name: /go back/i }));
    await settleDebounce();

    expect(screen.getByTestId('location')).toHaveTextContent('/browse?region=NL');
  });
});
