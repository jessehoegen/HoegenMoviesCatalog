import { describe, expect, it } from 'vitest';
import { nextFlags } from './toggle';

describe('nextFlags', () => {
  it('favorites a movie that has no entry yet', () => {
    expect(nextFlags(null, 'favorite')).toEqual({ isFavorite: true, status: null });
  });

  it('removes the entry when the last flag is cleared', () => {
    expect(nextFlags({ isFavorite: true, status: null }, 'favorite')).toBeNull();
    expect(nextFlags({ isFavorite: false, status: 'wishlist' }, 'wishlist')).toBeNull();
  });

  it('adds a movie to the wishlist', () => {
    expect(nextFlags(null, 'wishlist')).toEqual({
      isFavorite: false,
      status: 'wishlist',
    });
  });

  it('moves a wishlisted movie to watched in one step', () => {
    expect(nextFlags({ isFavorite: false, status: 'wishlist' }, 'watched')).toEqual({
      isFavorite: false,
      status: 'watched',
    });
  });

  it('keeps the favorite when a status is cleared', () => {
    expect(nextFlags({ isFavorite: true, status: 'watched' }, 'watched')).toEqual({
      isFavorite: true,
      status: null,
    });
  });

  it('keeps the status when favorite is toggled', () => {
    expect(nextFlags({ isFavorite: false, status: 'wishlist' }, 'favorite')).toEqual({
      isFavorite: true,
      status: 'wishlist',
    });
  });
});
