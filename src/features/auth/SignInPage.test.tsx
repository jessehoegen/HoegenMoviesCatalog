import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { server } from '../../test/server';
import { signedIn } from '../../test/auth';
import { authUrl } from '../../test/supabase';
import { renderWithProviders } from '../../test/utils';
import { SignInPage } from './SignInPage';
import type { AuthState } from './useSession';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderSignIn(route: string, auth?: AuthState) {
  return renderWithProviders(
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { route, auth },
  );
}

/** Answers POST /auth/v1/otp and records the return address Supabase would email. */
function mockOtp(respond: () => Response = () => HttpResponse.json({})) {
  const seen: { redirectTo: string | null } = { redirectTo: null };
  server.use(
    http.post(authUrl('otp'), ({ request }) => {
      seen.redirectTo = new URL(request.url).searchParams.get('redirect_to');
      return respond();
    }),
  );
  return seen;
}

async function requestLink(email = 'reader@example.com') {
  await userEvent.type(screen.getByLabelText('Email address'), email);
  await userEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
}

describe('SignInPage', () => {
  it('sends a link that returns to next, then says to check your email', async () => {
    const seen = mockOtp();
    renderSignIn('/sign-in?next=%2Fmovie%2F550%3Fregion%3DNL&region=NL');

    await requestLink();

    expect(
      await screen.findByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument();
    expect(screen.getByText('reader@example.com')).toBeInTheDocument();
    expect(seen.redirectTo).toContain('/auth/callback?next=%2Fmovie%2F550%3Fregion%3DNL');
  });

  it('returns to /browse instead of a next that leaves the site', async () => {
    const seen = mockOtp();
    renderSignIn('/sign-in?next=https%3A%2F%2Fevil.example');

    await requestLink();

    await screen.findByRole('heading', { name: 'Check your email' });
    expect(seen.redirectTo).toContain('/auth/callback?next=%2Fbrowse');
  });

  it('explains the email rate limit', async () => {
    mockOtp(() =>
      HttpResponse.json(
        { code: 429, error_code: 'over_email_send_rate_limit', msg: 'rate limit' },
        { status: 429 },
      ),
    );
    renderSignIn('/sign-in');

    await requestLink();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many sign-in emails. Wait a few minutes and try again.',
    );
  });

  it('explains an address Supabase will not send to', async () => {
    mockOtp(() =>
      HttpResponse.json(
        { code: 400, error_code: 'email_address_invalid', msg: 'invalid' },
        { status: 400 },
      ),
    );
    renderSignIn('/sign-in');

    await requestLink('reader@example.test');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That email address can't be used.",
    );
  });

  it('says what is stored, next to the form', () => {
    renderSignIn('/sign-in');

    expect(
      screen.getByText(
        'We store your email address and your lists. You can delete your account at any time.',
      ),
    ).toBeInTheDocument();
  });

  it('goes back to the form to use a different email', async () => {
    mockOtp();
    renderSignIn('/sign-in');
    await requestLink();
    await screen.findByRole('heading', { name: 'Check your email' });

    await userEvent.click(screen.getByRole('button', { name: 'Use a different email' }));

    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('sends someone already signed in straight to next', () => {
    renderSignIn('/sign-in?next=%2Flists%3Fregion%3DNL', signedIn);

    expect(screen.getByTestId('location')).toHaveTextContent('/lists?region=NL');
  });
});
