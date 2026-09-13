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
    // Browsers drop tabs and newlines anywhere in a URL, so each of these
    // reads as another host once they're gone.
    ['a tab before another host', '/\t/evil.example'],
    ['a newline before another host', '/\n/evil.example'],
    ['a tab before the backslash trick', '/\t\\evil.example'],
    // A leading dot segment collapses away when the URL parser normalizes the
    // path, turning what looks like a same-site path into "//evil.example".
    ['a dot segment before another host', '/.//evil.example'],
    ['a double-dot segment before another host', '/..//evil.example'],
    ['a nested double-dot segment before another host', '/a/..//evil.example'],
    ['a percent-encoded dot segment before another host', '/%2e//evil.example'],
    ['a percent-encoded double-dot segment before another host', '/%2E%2E//evil.example'],
    ['a dot segment before the backslash trick', '/./\\evil.example'],
    ['a dot segment before a tab and another host', '/./\t/evil.example'],
  ])('falls back to /browse for %s', (_label, raw) => {
    expect(safeNext(raw)).toBe('/browse');
  });
});
