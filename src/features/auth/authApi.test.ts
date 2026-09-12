import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { supabase } from '../../lib/supabase';
import { server } from '../../test/server';
import { authUrl, restUrl, sessionResponse } from '../../test/supabase';
import { deleteMyAccount, exchangeCode, sendMagicLink, signOut } from './authApi';

/** Supabase Auth's error body shape, as observed from supabase-js 2.116. */
function authError(status: number, errorCode: string) {
  return HttpResponse.json({ code: status, error_code: errorCode, msg: errorCode }, { status });
}

describe('sendMagicLink', () => {
  it('asks Supabase for a link that comes back to /auth/callback with next', async () => {
    let redirectTo: string | null = null;
    server.use(
      http.post(authUrl('otp'), ({ request }) => {
        redirectTo = new URL(request.url).searchParams.get('redirect_to');
        return HttpResponse.json({});
      }),
    );

    const result = await sendMagicLink('reader@example.com', '/movie/550?region=NL');

    expect(result).toEqual({ ok: true });
    expect(redirectTo).toBe(
      `${window.location.origin}/auth/callback?next=%2Fmovie%2F550%3Fregion%3DNL`,
    );
  });

  it('reports the email rate limit', async () => {
    server.use(http.post(authUrl('otp'), () => authError(429, 'over_email_send_rate_limit')));

    expect(await sendMagicLink('reader@example.com', '/lists')).toEqual({
      ok: false,
      reason: 'rate-limited',
    });
  });

  it('reports an address Supabase will not send to', async () => {
    server.use(http.post(authUrl('otp'), () => authError(400, 'email_address_invalid')));

    expect(await sendMagicLink('reader@example.test', '/lists')).toEqual({
      ok: false,
      reason: 'invalid-email',
    });
  });

  it('reports any other failure generically', async () => {
    server.use(http.post(authUrl('otp'), () => authError(500, 'unexpected_failure')));

    expect(await sendMagicLink('reader@example.com', '/lists')).toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});

describe('exchangeCode', () => {
  it('turns the code from the email into a session', async () => {
    server.use(
      http.post(authUrl('otp'), () => HttpResponse.json({})),
      http.post(authUrl('token'), () => HttpResponse.json(sessionResponse())),
    );
    // Asking for the link is what stores the PKCE verifier in this browser.
    await sendMagicLink('reader@example.com', '/lists');

    expect(await exchangeCode('code-from-the-email')).toEqual({ ok: true });
  });

  it('says "other browser", without contacting Supabase, when this browser never asked for a link', async () => {
    // No handlers: MSW fails the test on any request, which proves supabase-js
    // gives up before sending one (error code pkce_code_verifier_not_found).
    expect(await exchangeCode('code-from-the-email')).toEqual({
      ok: false,
      reason: 'other-browser',
    });
  });

  it('says "expired" when Supabase no longer knows the code', async () => {
    server.use(
      http.post(authUrl('otp'), () => HttpResponse.json({})),
      http.post(authUrl('token'), () => authError(404, 'flow_state_not_found')),
    );
    await sendMagicLink('reader@example.com', '/lists');

    expect(await exchangeCode('an-old-code')).toEqual({ ok: false, reason: 'expired' });
  });
});

/** A real session in this browser: ask for a link, then exchange its code. */
async function signInForReal() {
  server.use(
    http.post(authUrl('otp'), () => HttpResponse.json({})),
    http.post(authUrl('token'), () => HttpResponse.json(sessionResponse())),
  );
  await sendMagicLink('reader@example.com', '/account');
  await exchangeCode('code-from-the-email');
}

describe('signOut', () => {
  it("ends this browser's session", async () => {
    await signInForReal();
    server.use(http.post(authUrl('logout'), () => new HttpResponse(null, { status: 204 })));

    expect(await signOut()).toBe(true);
  });

  it("still reports success when the logout request fails but Supabase clears the session anyway", async () => {
    // supabase-js clears this browser's session before reporting most
    // failures (anything but 401/403/404), so a 500 here still ends up
    // signed out. signOut()'s contract is about the session, not the
    // request, so it must report true.
    await signInForReal();
    server.use(
      http.post(authUrl('logout'), () =>
        HttpResponse.json({ code: 500, error_code: 'unexpected_failure', msg: 'boom' }, { status: 500 }),
      ),
    );

    expect(await signOut()).toBe(true);
    expect((await supabase.auth.getSession()).data.session).toBeNull();
  });
});

describe('deleteMyAccount', () => {
  it('calls delete_my_account', async () => {
    let called = false;
    server.use(
      http.post(restUrl('rpc/delete_my_account'), () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    expect(await deleteMyAccount()).toBe(true);
    expect(called).toBe(true);
  });

  it('reports failure when the database refuses', async () => {
    server.use(
      http.post(restUrl('rpc/delete_my_account'), () =>
        HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 }),
      ),
    );

    expect(await deleteMyAccount()).toBe(false);
  });
});
