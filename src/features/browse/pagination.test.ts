import { describe, expect, it } from 'vitest';
import { getNextPageParam, MAX_TMDB_PAGE } from './pagination';

function page(current: number, total: number) {
  return { page: current, total_pages: total, total_results: total * 20, results: [] };
}

describe('getNextPageParam', () => {
  it('advances to the next page mid-list', () => {
    expect(getNextPageParam(page(1, 10))).toBe(2);
  });

  it('stops at the final page', () => {
    expect(getNextPageParam(page(10, 10))).toBeUndefined();
  });

  it('stops at page 500 even when TMDB reports far more pages', () => {
    // TMDB rejects page 501 despite advertising total_pages in the tens of
    // thousands. Without this cap the grid errors at the bottom of a broad
    // result set instead of ending cleanly.
    expect(getNextPageParam(page(499, 38020))).toBe(500);
    expect(getNextPageParam(page(MAX_TMDB_PAGE, 38020))).toBeUndefined();
  });

  it('returns undefined for an empty result set', () => {
    expect(getNextPageParam(page(1, 0))).toBeUndefined();
  });
});
