import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { isSupabaseConfigured } from '../../lib/supabase';
import { sendMagicLink, type SendLinkResult } from './authApi';
import { safeNext } from './safeNext';
import { useSession } from './useSession';

type FailureReason = Extract<SendLinkResult, { ok: false }>['reason'];

type Phase =
  | { name: 'editing' }
  | { name: 'sending' }
  | { name: 'sent'; email: string }
  | { name: 'failed'; reason: FailureReason };

const FAILURE_MESSAGES: Record<FailureReason, string> = {
  'rate-limited': 'Too many sign-in emails. Wait a few minutes and try again.',
  'invalid-email': "That email address can't be used.",
  failed: "Couldn't send the sign-in email. Try again.",
};

export function SignInPage() {
  const [searchParams] = useSearchParams();
  const session = useSession();
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>({ name: 'editing' });
  const next = safeNext(searchParams.get('next'));

  // Same pattern as ErrorState's TMDB_TOKEN message: a visitor can't fix
  // this, so say so, and tell the site owner exactly what is missing.
  if (!isSupabaseConfigured) {
    return (
      <div className="py-16 text-center">
        <p className="text-neutral-300">
          Sign-in isn't available because this site is misconfigured. This isn't something
          you can fix from here.
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          Site owner: set <code className="text-neutral-300">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-neutral-300">VITE_SUPABASE_PUBLISHABLE_KEY</code> in the
          Vercel project's environment variables, then redeploy.
        </p>
      </div>
    );
  }

  // Already signed in, e.g. after pressing Back past the sign-in: nothing to do.
  if (session.status === 'signed-in') {
    return <Navigate to={next} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    setPhase({ name: 'sending' });
    const result = await sendMagicLink(address, next);
    setPhase(
      result.ok
        ? { name: 'sent', email: address }
        : { name: 'failed', reason: result.reason },
    );
  }

  if (phase.name === 'sent') {
    return (
      <section className="mx-auto max-w-sm py-12">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="mt-3 text-neutral-300">
          We sent a sign-in link to{' '}
          <strong className="text-neutral-100">{phase.email}</strong>.
        </p>
        <button
          type="button"
          onClick={() => setPhase({ name: 'editing' })}
          className="mt-6 text-sm text-neutral-400 underline"
        >
          Use a different email
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-sm py-12">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="mt-6 flex flex-col gap-3"
      >
        <label htmlFor="sign-in-email" className="text-sm text-neutral-300">
          Email address
        </label>
        <input
          id="sign-in-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100"
        />
        <button
          type="submit"
          disabled={phase.name === 'sending'}
          className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
        >
          Send sign-in link
        </button>
        {phase.name === 'failed' && (
          <p role="alert" className="text-sm text-red-300">
            {FAILURE_MESSAGES[phase.reason]}
          </p>
        )}
      </form>

      <p className="mt-6 text-xs text-neutral-500">
        We store your email address and your lists. You can delete your account at any
        time.
      </p>
    </section>
  );
}
