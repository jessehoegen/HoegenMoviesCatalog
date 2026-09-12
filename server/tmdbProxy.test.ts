// @vitest-environment node
// The proxy runs on Vercel's Edge runtime, not in a browser, so these tests use
// the node environment. MSW (started in src/test/setup.ts) intercepts the
// proxy's outbound calls to TMDB.
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../src/test/server';
import { handleTmdbProxy, type ProxyEnv } from './tmdbProxy';

const env: ProxyEnv = {
  TMDB_TOKEN: 'server-token',
  VERCEL_PROJECT_PRODUCTION_URL: 'movie-catalog.vercel.app',
  VERCEL_URL: 'movie-catalog-git-abc123.vercel.app',
};

const SAME_ORIGIN = { 'Sec-Fetch-Site': 'same-origin' };

function proxyRequest(
  pathAndQuery: string,
  headers: Record<string, string> = SAME_ORIGIN,
): Request {
  return new Request(`https://movie-catalog.vercel.app${pathAndQuery}`, { headers });
}

// Records every request that reaches TMDB, so a test can assert that none did.
function recordTmdbCalls(): string[] {
  const calls: string[] = [];
  server.use(
    http.all('https://api.themoviedb.org/*', ({ request }) => {
      calls.push(request.url);
      return HttpResponse.json({});
    }),
  );
  return calls;
}

describe('handleTmdbProxy', () => {
  it('forwards an allowlisted path to TMDB with the bearer token and the query string', async () => {
    let seenUrl = '';
    let seenAuth: string | null = null;

    server.use(
      http.get('https://api.themoviedb.org/3/discover/movie', ({ request }) => {
        seenUrl = request.url;
        seenAuth = request.headers.get('Authorization');
        return HttpResponse.json({ page: 1 });
      }),
    );

    const response = await handleTmdbProxy(
      proxyRequest('/api/tmdb/discover/movie?watch_region=NL&page=2'),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ page: 1 });
    expect(seenAuth).toBe('Bearer server-token');
    const forwarded = new URL(seenUrl);
    expect(forwarded.searchParams.get('watch_region')).toBe('NL');
    expect(forwarded.searchParams.get('page')).toBe('2');
  });

  it('accepts the rewritten form vercel.json produces and does not forward the path parameter', async () => {
    let seenUrl = '';

    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json({ id: 550 });
      }),
    );

    const response = await handleTmdbProxy(
      proxyRequest('/api/tmdb?tmdb_path=movie/550&append_to_response=watch/providers'),
      env,
    );

    expect(response.status).toBe(200);
    const forwarded = new URL(seenUrl);
    expect(forwarded.pathname).toBe('/3/movie/550');
    expect(forwarded.searchParams.get('append_to_response')).toBe('watch/providers');
    expect(forwarded.searchParams.has('tmdb_path')).toBe(false);
  });

  it.each([
    '/api/tmdb/account',
    '/api/tmdb/movie/550/credits',
    '/api/tmdb/movie/abc',
    '/api/tmdb?tmdb_path=account',
    '/api/tmdb',
    '/api/tmdb/movie%2F550',
    '/api/tmdb//movie/550',
    '/api/tmdb/movie/550/%2e%2e/%2e%2e/account',
    '/api/tmdb?tmdb_path=//evil.example/movie/550',
    '/api/tmdb?tmdb_path=/movie/550',
    '/api/tmdb?tmdb_path=movie/550%3Fapi_key%3Dx',
    '/api/tmdb?tmdb_path=account&tmdb_path=movie/550',
    '/api/tmdbx/movie/550',
  ])('rejects %s with 404 without contacting TMDB', async (pathAndQuery) => {
    const calls = recordTmdbCalls();

    const response = await handleTmdbProxy(proxyRequest(pathAndQuery), env);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'path_not_allowed' });
    // The allowlist's job is to never reach TMDB, not merely to return 404.
    expect(calls).toEqual([]);
  });

  it.each<[string, Record<string, string>]>([
    ['no Sec-Fetch-Site and no Referer', {}],
    ['a foreign Referer', { Referer: 'https://evil.example/page' }],
    [
      'a cross-site fetch',
      { 'Sec-Fetch-Site': 'cross-site', Referer: 'https://evil.example/page' },
    ],
    [
      'a cross-site fetch carrying the production Referer',
      {
        'Sec-Fetch-Site': 'cross-site',
        Referer: 'https://movie-catalog.vercel.app/browse',
      },
    ],
  ])(
    'rejects a request with %s with 403 without contacting TMDB',
    async (_label, headers) => {
      const calls = recordTmdbCalls();

      const response = await handleTmdbProxy(
        proxyRequest('/api/tmdb/movie/550', headers),
        env,
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'origin_not_allowed' });
      expect(calls).toEqual([]);
    },
  );

  it.each([
    ['the production domain', 'https://movie-catalog.vercel.app/browse'],
    ['the current deployment', 'https://movie-catalog-git-abc123.vercel.app/browse'],
    ['local development', 'http://localhost:5173/browse'],
  ])(
    'allows a Referer from %s when Sec-Fetch-Site is absent',
    async (_label, referer) => {
      recordTmdbCalls();

      const response = await handleTmdbProxy(
        proxyRequest('/api/tmdb/movie/550', { Referer: referer }),
        env,
      );

      expect(response.status).toBe(200);
    },
  );

  it('returns 502 with a distinct error code when the upstream fetch throws, instead of crashing', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', () => HttpResponse.error()),
    );

    const response = await handleTmdbProxy(proxyRequest('/api/tmdb/movie/550'), env);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'upstream_unreachable' });
  });

  // Regression guard: the client's 401 message, not-found page, retry policy,
  // and TmdbError all depend on TMDB's own status and body arriving intact.
  it('passes a TMDB 401 through with its status and body intact', async () => {
    const tmdbBody = {
      status_code: 7,
      status_message: 'Invalid API key: You must be granted a valid key.',
      success: false,
    };
    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', () =>
        HttpResponse.json(tmdbBody, { status: 401 }),
      ),
    );

    const response = await handleTmdbProxy(proxyRequest('/api/tmdb/movie/550'), env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(tmdbBody);
  });
});
