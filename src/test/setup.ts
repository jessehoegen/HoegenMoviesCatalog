import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
// Supabase keeps the session and the PKCE verifier in localStorage. A test must
// never inherit another test's sign-in. Node-environment tests (server/) have
// no localStorage, hence the optional call.
afterEach(() => globalThis.localStorage?.clear());
afterAll(() => server.close());

// jsdom does not implement IntersectionObserver, which LoadMoreButton uses.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly scrollMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
