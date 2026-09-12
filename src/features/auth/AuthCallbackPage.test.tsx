import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { server } from '../../test/server';
import { regionsFixture } from '../../test/fixtures';
import { authUrl, sessionResponse } from '../../test/supabase';
import { renderWithProviders } from '../../test/utils';
import { sendMagicLink } from './authApi';
import { AuthCallbackPage } from './AuthCallbackPage';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderCallback(route: string, { strict = false } = {}) {
  // The "Send a new link" link carries the region, which useRegion resolves
  // against TMDB's region list.
  server.use(
    http.get('/api/tmdb/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );
  const routes = (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>
  );
  return renderWithProviders(strict ? <StrictMode>{routes}</StrictMode> : routes, { route });
}

/** Counts POST /auth/v1/token calls, answering with a session or an error. */
function mockToken(respond: () => Response = () => HttpResponse.json(sessionResponse())) {
  const calls = { count: 0 };
  server.use(
    http.post(authUrl('token'), () => {
      calls.count += 1;
      return respond();
    }),
  );
  return calls;
}

/** Asks for a link first, as the real flow does: that stores the PKCE verifier. */
async function askForLinkInThisBrowser() {
  server.use(http.post(authUrl('otp'), () => HttpResponse.json({})));
  await sendMagicLink('reader@example.com', '/lists');
}

describe('AuthCallbackPage', () => {
  it('signs in, then goes to next', async () => {
    await askForLinkInThisBrowser();
    mockToken();

    renderCallback('/auth/callback?code=abc&next=%2Flists%3Fregion%3DNL');

    expect(await screen.findByTestId('location')).toHaveTextContent('/lists?region=NL');
  });

  it('goes to /browse when next points off the site', async () => {
    await askForLinkInThisBrowser();
    mockToken();

    renderCallback('/auth/callback?code=abc&next=https%3A%2F%2Fevil.example');

    expect(await screen.findByTestId('location')).toHaveTextContent('/browse');
  });

  it('exchanges the code exactly once under StrictMode', async () => {
    await askForLinkInThisBrowser();
    const calls = mockToken();

    renderCallback('/auth/callback?code=abc&next=%2Flists', { strict: true });

    await screen.findByTestId('location');
    expect(calls.count).toBe(1);
  });

  it('asks for the same browser when this one never requested the link', async () => {
    renderCallback('/auth/callback?code=abc&next=%2Flists');

    expect(
      await screen.findByText('Open the sign-in link in the same browser where you asked for it.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Send a new link' }).getAttribute('href')).toContain(
      '/sign-in?next=%2Flists',
    );
  });

  it('says expired, without an exchange, when Supabase redirected with an error', async () => {
    const calls = mockToken();

    renderCallback(
      '/auth/callback?error=access_denied&error_code=otp_expired&error_description=expired&next=%2Flists',
    );

    expect(await screen.findByText('This sign-in link has expired.')).toBeInTheDocument();
    expect(calls.count).toBe(0);
  });

  it('says expired when the link carries no code', async () => {
    renderCallback('/auth/callback?next=%2Flists');

    expect(await screen.findByText('This sign-in link has expired.')).toBeInTheDocument();
  });

  it('says expired when Supabase no longer knows the code', async () => {
    await askForLinkInThisBrowser();
    mockToken(() =>
      HttpResponse.json(
        { code: 404, error_code: 'flow_state_not_found', msg: 'no flow state' },
        { status: 404 },
      ),
    );

    renderCallback('/auth/callback?code=old&next=%2Flists');

    expect(await screen.findByText('This sign-in link has expired.')).toBeInTheDocument();
  });
});
