import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useRegion } from '../../app/useRegion';
import { exchangeCode, type ExchangeResult } from './authApi';
import { safeNext } from './safeNext';
import { signInPath } from './signInPath';

type FailureReason = Extract<ExchangeResult, { ok: false }>['reason'];

const FAILURE_MESSAGES: Record<FailureReason, string> = {
  expired: 'This sign-in link has expired.',
  'other-browser': 'Open the sign-in link in the same browser where you asked for it.',
};

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { region } = useRegion();
  const [exchangeFailure, setExchangeFailure] = useState<FailureReason | null>(null);

  const next = safeNext(searchParams.get('next'));
  const code = searchParams.get('code');
  // Supabase redirects here with ?error=... when it rejected the link itself,
  // for example an expired one. A link with no code at all is treated the same.
  const linkFailure: FailureReason | null = searchParams.get('error') || !code ? 'expired' : null;

  // The code works once. React StrictMode runs effects twice in development,
  // and a second exchange would fail after the first succeeded, showing an
  // error to someone who had just signed in. A ref survives StrictMode's
  // simulated remount, so this guard makes the exchange run once.
  const exchangeStarted = useRef(false);

  useEffect(() => {
    if (linkFailure || !code || exchangeStarted.current) return;
    exchangeStarted.current = true;

    void exchangeCode(code).then((result) => {
      if (result.ok) navigate(next, { replace: true });
      else setExchangeFailure(result.reason);
    });
  }, [code, linkFailure, navigate, next]);

  const failure = linkFailure ?? exchangeFailure;

  if (!failure) {
    return (
      <p role="status" className="py-16 text-center text-neutral-400">
        Signing you in…
      </p>
    );
  }

  return (
    <div className="py-16 text-center">
      <p className="text-neutral-300">{FAILURE_MESSAGES[failure]}</p>
      <Link
        to={signInPath(region, next)}
        className="mt-4 inline-block rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white"
      >
        Send a new link
      </Link>
    </div>
  );
}
