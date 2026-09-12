import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { server } from '../../test/server';
import { regionsFixture } from '../../test/fixtures';
import { signedIn, signedOut, testUser } from '../../test/auth';
import { authUrl, entryRow, restUrl, sessionResponse } from '../../test/supabase';
import { renderWithProviders } from '../../test/utils';
import { exchangeCode, sendMagicLink } from '../auth/authApi';
import type { AuthState } from '../auth/useSession';
import { listsKeys } from '../lists/queries';
import { AccountPage } from './AccountPage';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderAccount(auth: AuthState = signedIn) {
  server.use(
    http.get('/api/tmdb/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );
  const rendered = renderWithProviders(
    <Routes>
      <Route path="/account" element={<AccountPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { route: '/account?region=NL', auth },
  );
  // Something cached for the page to clear on sign-out or deletion.
  rendered.queryClient.setQueryData(listsKeys.all(testUser.id), [entryRow()]);
  return rendered;
}

function mockDeleteFunction(respond: () => Response) {
  const calls = { count: 0 };
  server.use(
    http.post(restUrl('rpc/delete_my_account'), () => {
      calls.count += 1;
      return respond();
    }),
  );
  return calls;
}

describe('AccountPage', () => {
  it('shows who is signed in', () => {
    renderAccount();

    expect(screen.getByText('reader@example.com')).toBeInTheDocument();
  });

  it('signs out, clears the lists from the cache, and returns to the catalog', async () => {
    const { queryClient } = renderAccount();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByTestId('location')).toHaveTextContent('/browse?region=NL');
    expect(queryClient.getQueryData(listsKeys.all(testUser.id))).toBeUndefined();
  });

  it('says so when signing out fails', async () => {
    // A real session, so that signing out has to ask Supabase.
    server.use(
      http.post(authUrl('otp'), () => HttpResponse.json({})),
      http.post(authUrl('token'), () => HttpResponse.json(sessionResponse())),
      http.post(authUrl('logout'), () =>
        HttpResponse.json({ code: 500, error_code: 'unexpected_failure', msg: 'boom' }, { status: 500 }),
      ),
    );
    await sendMagicLink('reader@example.com', '/account');
    await exchangeCode('code-from-the-email');
    renderAccount();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't sign out. Try again.");
  });

  it('asks for confirmation before deleting, and can be cancelled', async () => {
    const calls = mockDeleteFunction(() => new HttpResponse(null, { status: 204 }));
    renderAccount();

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(
      screen.getByText('This permanently deletes your account and all your lists.'),
    ).toBeInTheDocument();
    expect(calls.count).toBe(0);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument();
  });

  it('deletes the account, clears the cache, and says it is done', async () => {
    const calls = mockDeleteFunction(() => new HttpResponse(null, { status: 204 }));
    const { queryClient } = renderAccount();

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByText('Your account has been deleted.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the catalog' }).getAttribute('href')).toBe(
      '/browse?region=NL',
    );
    expect(calls.count).toBe(1);
    expect(queryClient.getQueryData(listsKeys.all(testUser.id))).toBeUndefined();
  });

  it('says so when deletion fails, and keeps the account', async () => {
    mockDeleteFunction(() => HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 }));
    renderAccount();

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't delete your account. Try again.",
    );
    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeEnabled();
  });

  it('sends a visitor to sign in, and back here afterwards', () => {
    renderAccount(signedOut);

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/sign-in?next=%2Faccount%3Fregion%3DNL&region=NL',
    );
  });
});
