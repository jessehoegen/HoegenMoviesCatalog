import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRegion, withRegion } from '../../app/useRegion';
import { deleteMyAccount, signOut } from '../auth/authApi';
import { SignInRedirect } from '../auth/SignInRedirect';
import { useSession } from '../auth/useSession';
import { clearListsCache } from '../lists/queries';

type Phase = 'idle' | 'signing-out' | 'confirming-delete' | 'deleting' | 'deleted';

const SECONDARY_BUTTON =
  'rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50';

export function AccountPage() {
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { region } = useRegion();
  const [phase, setPhase] = useState<Phase>('idle');
  const [failure, setFailure] = useState<'sign-out' | 'delete' | null>(null);
  const leaving = phase === 'signing-out' || phase === 'deleting';

  // This page guards itself instead of sending every signed-out visitor to
  // sign in: after deleting their account the user *is* signed out, and must
  // still see this message.
  if (phase === 'deleted') {
    return (
      <div className="py-16 text-center">
        <p className="text-neutral-300">Your account has been deleted.</p>
        <Link
          to={withRegion('/browse', region)}
          className="mt-4 inline-block text-sm text-neutral-400 underline"
        >
          Back to the catalog
        </Link>
      </div>
    );
  }

  // While leaving, the session ends a moment before this page moves on. A
  // placeholder in between stops the sign-in redirect from winning that race.
  if (session.status === 'loading' || (leaving && session.status === 'signed-out')) {
    return <div className="h-40 animate-pulse rounded-lg bg-neutral-900" />;
  }
  if (session.status === 'signed-out') {
    return <SignInRedirect />;
  }

  async function handleSignOut() {
    setFailure(null);
    setPhase('signing-out');
    if (await signOut()) {
      clearListsCache(queryClient);
      navigate(withRegion('/browse', region));
    } else {
      setPhase('idle');
      setFailure('sign-out');
    }
  }

  async function handleDelete() {
    setFailure(null);
    setPhase('deleting');
    if (await deleteMyAccount()) {
      clearListsCache(queryClient);
      setPhase('deleted');
    } else {
      setPhase('confirming-delete');
      setFailure('delete');
    }
  }

  return (
    <section className="mx-auto max-w-md py-12">
      <h1 className="text-2xl font-semibold">Account</h1>
      <p className="mt-3 text-neutral-300">
        Signed in as <strong className="text-neutral-100">{session.user.email}</strong>
      </p>

      <button
        type="button"
        disabled={leaving}
        onClick={() => void handleSignOut()}
        className={`mt-6 ${SECONDARY_BUTTON}`}
      >
        Sign out
      </button>
      {failure === 'sign-out' && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          Couldn't sign out. Try again.
        </p>
      )}

      <div className="mt-10 border-t border-neutral-800 pt-6">
        {phase === 'confirming-delete' || phase === 'deleting' ? (
          <>
            <p className="text-neutral-300">
              This permanently deletes your account and all your lists.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={phase === 'deleting'}
                onClick={() => void handleDelete()}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                Delete my account
              </button>
              <button
                type="button"
                disabled={phase === 'deleting'}
                onClick={() => {
                  setPhase('idle');
                  setFailure(null);
                }}
                className={SECONDARY_BUTTON}
              >
                Cancel
              </button>
            </div>
            {failure === 'delete' && (
              <p role="alert" className="mt-2 text-sm text-red-300">
                Couldn't delete your account. Try again.
              </p>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={leaving}
            onClick={() => setPhase('confirming-delete')}
            className="text-sm text-red-300 underline disabled:opacity-50"
          >
            Delete account
          </button>
        )}
      </div>
    </section>
  );
}
