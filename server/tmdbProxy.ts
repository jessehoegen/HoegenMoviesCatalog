// Server-side code: runs in the Vercel Edge function api/tmdb.ts, never in the
// browser. Unrelated to src/api/, which is browser code that calls this proxy.

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const PROXY_PREFIX = '/api/tmdb';

// vercel.json rewrites /api/tmdb/<path> to /api/tmdb?tmdb_path=<path>, because
// Vercel does not support catch-all function filenames outside Next.js.
export const PATH_PARAM = 'tmdb_path';

// One entry per TMDB endpoint the app calls (see src/api/movies.ts). This is
// what stops the proxy being a general-purpose public TMDB mirror. Adding an
// endpoint to the app means adding it here — a deliberate gate.
const ALLOWED_PATHS: readonly RegExp[] = [
  /^\/genre\/movie\/list$/,
  /^\/watch\/providers\/regions$/,
  /^\/watch\/providers\/movie$/,
  /^\/discover\/movie$/,
  /^\/search\/movie$/,
  /^\/movie\/\d+$/,
];

export interface ProxyEnv {
  TMDB_TOKEN?: string;
  VERCEL_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
}

export async function handleTmdbProxy(
  request: Request,
  env: ProxyEnv,
): Promise<Response> {
  if (!isAllowedOrigin(request, env)) {
    return rejection(403, 'origin_not_allowed');
  }

  const url = new URL(request.url);
  const tmdbPath = extractTmdbPath(url);
  if (tmdbPath === null || !ALLOWED_PATHS.some((pattern) => pattern.test(tmdbPath))) {
    return rejection(404, 'path_not_allowed');
  }

  const upstreamUrl = new URL(TMDB_BASE_URL + tmdbPath);
  for (const [key, value] of url.searchParams) {
    if (key !== PATH_PARAM) upstreamUrl.searchParams.append(key, value);
  }

  const upstream = await fetch(upstreamUrl, {
    headers: {
      Authorization: `Bearer ${env.TMDB_TOKEN}`,
      accept: 'application/json',
    },
  });

  // Status and body pass through untouched. The client's 401 message, 404
  // not-found page, retry policy, and TmdbError all read TMDB's own response;
  // wrapping it in a proxy envelope would break every one of them silently.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}

// Built on Sec-Fetch-Site, not Origin: browsers send no Origin header on
// same-origin GETs, which is every request this app makes, so an Origin check
// would reject all legitimate traffic. Sec-Fetch-Site is a forbidden header
// name, so page scripts cannot forge it. Non-browser clients can — see the
// spec's accepted risks.
function isAllowedOrigin(request: Request, env: ProxyEnv): boolean {
  if (request.headers.get('sec-fetch-site') === 'same-origin') return true;

  // Fallback for browsers that omit Sec-Fetch-Site.
  const referer = request.headers.get('referer');
  if (!referer) return false;

  let refererUrl: URL;
  try {
    refererUrl = new URL(referer);
  } catch {
    return false;
  }

  if (refererUrl.protocol === 'http:' && refererUrl.hostname === 'localhost') return true;

  // Vercel supplies both as bare hostnames: the stable production domain, and
  // the current deployment (which covers preview URLs).
  const allowedOrigins = [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL]
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host}`);

  return allowedOrigins.includes(refererUrl.origin);
}

// Accepts both /api/tmdb/movie/550 and the rewritten /api/tmdb?tmdb_path=movie/550.
// Which one the function sees depends on how Vercel presents a rewritten
// request; handling both keeps that platform detail out of the security logic.
// Either way the result must still pass the anchored allowlist.
function extractTmdbPath(url: URL): string | null {
  if (url.pathname.startsWith(PROXY_PREFIX + '/')) {
    return url.pathname.slice(PROXY_PREFIX.length);
  }
  if (url.pathname === PROXY_PREFIX) {
    const rewritten = url.searchParams.get(PATH_PARAM);
    return rewritten ? '/' + rewritten : null;
  }
  return null;
}

// Shaped differently from TMDB's { status_code, status_message } on purpose, so
// "the proxy blocked this" is distinguishable from "TMDB said no".
function rejection(
  status: 403 | 404,
  error: 'origin_not_allowed' | 'path_not_allowed',
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
