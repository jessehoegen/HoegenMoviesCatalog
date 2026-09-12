const FALLBACK = '/browse';

/**
 * The page to return to after signing in, taken from ?next=. Only a path on
 * this site is accepted. Without this check, a crafted sign-in link could send
 * someone to another website right after they sign in (an "open redirect").
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/')) return FALLBACK;
  // Browsers read "//evil.example" and "/\evil.example" as another host.
  if (raw.startsWith('//') || raw.startsWith('/\\')) return FALLBACK;
  return raw;
}
