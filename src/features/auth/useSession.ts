import { createContext, useContext } from 'react';

/** The app's own view of a user: just what the UI needs. */
export interface AppUser {
  id: string;
  email: string;
}

// A union rather than { status; user: AppUser | null }: when status is
// 'signed-in', TypeScript then knows user is not null.
export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signed-out'; user: null }
  | { status: 'signed-in'; user: AppUser };

// The default applies outside an AuthProvider, which in practice means
// component tests that don't ask for a session. Signed out rather than
// loading, so those render as they would for a visitor instead of waiting
// forever.
export const AuthContext = createContext<AuthState>({ status: 'signed-out', user: null });

export function useSession(): AuthState {
  return useContext(AuthContext);
}
