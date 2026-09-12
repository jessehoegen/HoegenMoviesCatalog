import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { AuthContext, type AuthState } from './useSession';

function toAuthState(session: Session | null): AuthState {
  if (!session) return { status: 'signed-out', user: null };
  return {
    status: 'signed-in',
    user: { id: session.user.id, email: session.user.email ?? '' },
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    // Supabase calls this straight away with INITIAL_SESSION (the session saved
    // in this browser, or null), then again on every sign-in, sign-out and
    // token refresh. So this one subscription is the only source of session
    // state. The callback only sets state and is deliberately not async:
    // calling other supabase.auth methods from inside it can deadlock, per
    // Supabase's own documentation.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(toAuthState(session));
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
