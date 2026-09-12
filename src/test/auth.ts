import type { AppUser, AuthState } from '../features/auth/useSession';

export const testUser: AppUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'reader@example.com',
};

export const signedIn: AuthState = { status: 'signed-in', user: testUser };
export const signedOut: AuthState = { status: 'signed-out', user: null };
export const authLoading: AuthState = { status: 'loading', user: null };
