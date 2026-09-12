import { supabase } from '../../lib/supabase';

// This module turns Supabase's error codes into the few outcomes the UI
// distinguishes, so pages never need to know Supabase's vocabulary.

export type SendLinkResult =
  { ok: true } | { ok: false; reason: 'rate-limited' | 'invalid-email' | 'failed' };

export async function sendMagicLink(
  email: string,
  next: string,
): Promise<SendLinkResult> {
  const redirect = new URL('/auth/callback', window.location.origin);
  redirect.searchParams.set('next', next);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Supabase only honours this address if it is on the project's Redirect
    // URLs list; otherwise the link silently goes to the Site URL (README).
    options: { emailRedirectTo: redirect.toString() },
  });

  if (!error) return { ok: true };
  if (error.code === 'over_email_send_rate_limit')
    return { ok: false, reason: 'rate-limited' };
  if (error.code === 'email_address_invalid')
    return { ok: false, reason: 'invalid-email' };
  return { ok: false, reason: 'failed' };
}

export type ExchangeResult =
  { ok: true } | { ok: false; reason: 'expired' | 'other-browser' };

// This browser doesn't hold the secret the link was issued for: it was opened
// in a different browser than the one that asked for it. supabase-js detects
// the missing verifier itself, before sending any request.
const OTHER_BROWSER_CODES = new Set([
  'pkce_code_verifier_not_found',
  'bad_code_verifier',
]);

export async function exchangeCode(code: string): Promise<ExchangeResult> {
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (!error) return { ok: true };
  if (error.code && OTHER_BROWSER_CODES.has(error.code)) {
    return { ok: false, reason: 'other-browser' };
  }
  // otp_expired, flow_state_not_found (the code is older than 5 minutes or was
  // already used), and anything unexpected: a new link fixes all of them.
  return { ok: false, reason: 'expired' };
}

/**
 * Ends the session in this browser. True when this browser's session is
 * gone, whether or not the request to Supabase succeeded: for most failures
 * (anything but 401/403/404) supabase-js still clears the local session
 * before reporting the error, so the error alone doesn't mean the session
 * survived. False only when the session is still there.
 */
export async function signOut(): Promise<boolean> {
  // 'local': this browser only. Other devices stay signed in.
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (!error) return true;

  const { data } = await supabase.auth.getSession();
  return data.session === null;
}

/**
 * Deletes the signed-in user's account and all their entries through the
 * delete_my_account database function, then clears this browser's session.
 * False when the database refused, in which case nothing was deleted.
 */
export async function deleteMyAccount(): Promise<boolean> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return false;

  // The user no longer exists, so Supabase answers this request with an
  // error. supabase-js still clears the local session for such answers
  // (401, 403, 404), and that's the only part left to do.
  await supabase.auth.signOut({ scope: 'local' });
  return true;
}
