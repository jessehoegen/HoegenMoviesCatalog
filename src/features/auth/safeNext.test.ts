import { describe, expect, it } from 'vitest';
import { safeNext } from './safeNext';

describe('safeNext', () => {
  it.each(['/movie/550?region=NL', '/lists'])('keeps a path on this site: %s', (path) => {
    expect(safeNext(path)).toBe(path);
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['another website', 'https://evil.example'],
    ['a protocol-relative URL', '//evil.example'],
    ['a backslash trick', '/\\evil.example'],
    ['a script URL', 'javascript:alert(1)'],
    ['a relative path', 'movie/550'],
  ])('falls back to /browse for %s', (_label, raw) => {
    expect(safeNext(raw)).toBe('/browse');
  });
});
