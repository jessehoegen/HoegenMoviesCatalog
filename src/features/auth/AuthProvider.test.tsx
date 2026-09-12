import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, render, screen } from '@testing-library/react';
import { supabase } from '../../lib/supabase';
import { server } from '../../test/server';
import { authUrl, sessionResponse } from '../../test/supabase';
import { AuthProvider } from './AuthProvider';
import { useSession } from './useSession';

function SessionProbe() {
  const session = useSession();
  return (
    <p>{session.status === 'signed-in' ? `signed in as ${session.user.email}` : session.status}</p>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <SessionProbe />
    </AuthProvider>,
  );
}

describe('AuthProvider', () => {
  it('starts loading, then reports signed out when no session is stored', async () => {
    renderProvider();

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(await screen.findByText('signed-out')).toBeInTheDocument();
  });

  it('follows the session through a magic-link sign-in and a sign-out', async () => {
    server.use(
      http.post(authUrl('otp'), () => HttpResponse.json({})),
      http.post(authUrl('token'), () => HttpResponse.json(sessionResponse())),
      http.post(authUrl('logout'), () => new HttpResponse(null, { status: 204 })),
    );
    renderProvider();
    await screen.findByText('signed-out');

    // The real sign-in sequence: asking for a link stores the PKCE verifier in
    // this browser, and exchanging the link's code turns it into a session.
    await act(async () => {
      await supabase.auth.signInWithOtp({ email: 'reader@example.com' });
      await supabase.auth.exchangeCodeForSession('code-from-the-email');
    });
    expect(await screen.findByText('signed in as reader@example.com')).toBeInTheDocument();

    await act(async () => {
      await supabase.auth.signOut({ scope: 'local' });
    });
    expect(await screen.findByText('signed-out')).toBeInTheDocument();
  });
});
