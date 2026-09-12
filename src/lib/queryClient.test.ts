import { describe, expect, it } from 'vitest';
import { TmdbError } from '../api/client';
import { ListsError } from '../features/lists/api';
import { shouldRetry } from './queryClient';

describe('shouldRetry', () => {
  it('does not retry 4xx client errors', () => {
    expect(shouldRetry(0, new TmdbError(401, 'Invalid API key.'))).toBe(false);
    expect(shouldRetry(0, new TmdbError(404, 'Not found.'))).toBe(false);
  });

  it('retries 429 rate limiting', () => {
    expect(shouldRetry(0, new TmdbError(429, 'Too many requests.'))).toBe(true);
  });

  it('retries 5xx server errors up to twice', () => {
    const error = new TmdbError(503, 'Service unavailable.');
    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(true);
    expect(shouldRetry(2, error)).toBe(false);
  });

  it('retries non-TMDB errors such as network failures', () => {
    expect(shouldRetry(0, new TypeError('Failed to fetch'))).toBe(true);
  });

  it('does not retry a lists request the database refused', () => {
    expect(shouldRetry(0, new ListsError(403, 'new row violates row-level security policy'))).toBe(
      false,
    );
    expect(shouldRetry(0, new ListsError(400, 'violates check constraint'))).toBe(false);
  });

  it('retries a lists request that got no response or a 5xx', () => {
    expect(shouldRetry(0, new ListsError(0, 'TypeError: fetch failed'))).toBe(true);
    expect(shouldRetry(1, new ListsError(503, 'Service Unavailable'))).toBe(true);
    expect(shouldRetry(2, new ListsError(503, 'Service Unavailable'))).toBe(false);
  });
});
