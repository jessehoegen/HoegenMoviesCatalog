import { describe, expect, it } from 'vitest';
import { backdropUrl, logoUrl, posterUrl } from './images';

describe('image URL builders', () => {
  it('builds a poster URL at the default size', () => {
    expect(posterUrl('/abc123.jpg')).toBe('https://image.tmdb.org/t/p/w342/abc123.jpg');
  });

  it('builds a poster URL at an explicit size', () => {
    expect(posterUrl('/abc123.jpg', 'w500')).toBe(
      'https://image.tmdb.org/t/p/w500/abc123.jpg',
    );
  });

  it('builds backdrop and logo URLs', () => {
    expect(backdropUrl('/back.jpg')).toBe('https://image.tmdb.org/t/p/w1280/back.jpg');
    expect(logoUrl('/logo.jpg')).toBe('https://image.tmdb.org/t/p/w92/logo.jpg');
  });

  it('returns null when TMDB has no artwork', () => {
    expect(posterUrl(null)).toBeNull();
    expect(backdropUrl(null)).toBeNull();
    expect(logoUrl(null)).toBeNull();
  });
});
