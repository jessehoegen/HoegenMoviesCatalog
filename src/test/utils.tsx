import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthState } from '../features/auth/useSession';
import { signedOut } from './auth';

interface RenderOptions {
  route?: string;
  /** The session state components see. Tests never need a real Supabase session. */
  auth?: AuthState;
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', auth = signedOut }: RenderOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );

  // Returned so a test can check what's in the cache, e.g. that signing out
  // cleared the lists.
  return { ...result, queryClient };
}
