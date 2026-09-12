import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/utils';
import { SignInPage } from './SignInPage';

// A separate file because vi.mock applies to a whole file: here the Supabase
// variables are "missing", everywhere else they are set by vite.config.ts.
vi.mock('../../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/supabase')>()),
  isSupabaseConfigured: false,
}));

describe('SignInPage without Supabase settings', () => {
  it('tells the site owner which variables to set, and offers no form', () => {
    renderWithProviders(<SignInPage />, { route: '/sign-in' });

    expect(
      screen.getByText("Sign-in isn't available because this site is misconfigured.", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeInTheDocument();
    expect(screen.getByText('VITE_SUPABASE_PUBLISHABLE_KEY')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  });
});
