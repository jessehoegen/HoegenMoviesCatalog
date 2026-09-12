const FALLBACK = '/browse';

// A made-up origin to read the value against. Anything that resolves to a
// different origin names another website.
const BASE = 'https://app.invalid';

/**
 * The page to return to after signing in, taken from ?next=. Only a path on
 * this site is accepted. Without this check, a crafted sign-in link could send
 * someone to another website right after they sign in (an "open redirect").
 *
 * The value is read with the browser's own URL parser rather than checked by
 * hand, because that parser quietly fixes things up: it drops tabs and
 * newlines anywhere, and reads "\" as "/". "/\t/evil.example" looks like a
 * path but is "//evil.example", another host, to the browser.
 */
export function safeNext(raw: string | null | undefined): string {
  // A value that doesn't start with "/" isn't a path on this site: it's
  // another website, a script URL, or relative to whatever page is current.
  if (!raw || !raw.startsWith('/')) return FALLBACK;

  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    // The parser rejects some values outright, e.g. "//[" (a broken host).
    return FALLBACK;
  }
  // "//evil.example", "/\evil.example" and their tab or newline variants all
  // land here: they resolve to another host.
  if (url.origin !== BASE) return FALLBACK;

  // Rebuilt from the parsed parts, so the app navigates to exactly the path
  // the check above approved.
  return url.pathname + url.search + url.hash;
}
