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
 *
 * The result is re-checked before it's returned, not just the input: parsing
 * also collapses "." and ".." segments, so a same-origin-looking input like
 * "/.//evil.example" can normalize to the path "//evil.example" - which
 * React Router and browsers alike read as a protocol-relative URL to another
 * host, not a path on this site.
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
  const result = url.pathname + url.search + url.hash;

  // Dot-segment normalization can turn a same-origin input into a result
  // starting with "//" or "/\", which is a protocol-relative URL to another
  // host, not a path on this site. Re-parse the result itself and require it
  // still starts with exactly one "/" and still resolves to this origin.
  if (result.startsWith('//') || result.startsWith('/\\')) return FALLBACK;
  try {
    if (new URL(result, BASE).origin !== BASE) return FALLBACK;
  } catch {
    return FALLBACK;
  }

  return result;
}
