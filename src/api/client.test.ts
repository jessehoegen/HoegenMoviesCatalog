import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { TmdbError, tmdbFetch } from './client';

describe('tmdbFetch', () => {
  it('calls the same-origin proxy and sends no Authorization header', async () => {
    let seenUrl = '';
    let seenAuth: string | null | undefined;

    server.use(
      http.get('/api/tmdb/movie/550', ({ request }) => {
        seenUrl = request.url;
        seenAuth = request.headers.get('Authorization');
        return HttpResponse.json({ id: 550 });
      }),
    );

    const data = await tmdbFetch<{ id: number }>('/movie/550');

    expect(data).toEqual({ id: 550 });
    expect(seenUrl).toBe(`${window.location.origin}/api/tmdb/movie/550`);
    // The property this project exists for: the browser holds no token.
    expect(seenAuth).toBeNull();
  });

  it('serialises params and omits undefined and empty values', async () => {
    let seenParams: URLSearchParams | undefined;

    server.use(
      http.get('/api/tmdb/discover/movie', ({ request }) => {
        seenParams = new URL(request.url).searchParams;
        return HttpResponse.json({
          page: 1,
          results: [],
          total_pages: 0,
          total_results: 0,
        });
      }),
    );

    await tmdbFetch('/discover/movie', {
      page: 2,
      watch_region: 'NL',
      with_genres: undefined,
      sort_by: '',
    });

    expect(seenParams?.get('page')).toBe('2');
    expect(seenParams?.get('watch_region')).toBe('NL');
    expect(seenParams?.has('with_genres')).toBe(false);
    expect(seenParams?.has('sort_by')).toBe(false);
  });

  it('throws TmdbError with TMDB status_message on 401', async () => {
    server.use(
      http.get('/api/tmdb/movie/550', () =>
        HttpResponse.json(
          { status_code: 7, status_message: 'Invalid API key.' },
          { status: 401 },
        ),
      ),
    );

    await expect(tmdbFetch('/movie/550')).rejects.toMatchObject({
      name: 'TmdbError',
      status: 401,
      statusCode: 7,
      message: 'Invalid API key.',
    });
  });

  it('throws TmdbError on 404 rather than resolving', async () => {
    server.use(
      http.get('/api/tmdb/movie/999999999', () =>
        HttpResponse.json(
          {
            status_code: 34,
            status_message: 'The resource you requested could not be found.',
          },
          { status: 404 },
        ),
      ),
    );

    await expect(tmdbFetch('/movie/999999999')).rejects.toBeInstanceOf(TmdbError);
  });

  it('falls back to the status text when the error body is not JSON', async () => {
    server.use(
      http.get(
        '/api/tmdb/movie/550',
        () =>
          new HttpResponse('upstream exploded', {
            status: 500,
            statusText: 'Internal Server Error',
          }),
      ),
    );

    await expect(tmdbFetch('/movie/550')).rejects.toMatchObject({
      status: 500,
      statusCode: undefined,
      // The point of the fallback: without asserting the message, deleting it
      // would leave this test passing on an error that says nothing.
      message: 'Internal Server Error',
    });
  });

  it('prefixes the proxy error code when the body carries error rather than status_message', async () => {
    server.use(
      http.get('/api/tmdb/movie/550', () =>
        HttpResponse.json({ error: 'origin_not_allowed' }, { status: 403 }),
      ),
    );

    await expect(tmdbFetch('/movie/550')).rejects.toMatchObject({
      status: 403,
      statusCode: undefined,
      message: 'Proxy error: origin_not_allowed',
    });
  });

  it('falls back to a status-only message when the body is not JSON and statusText is empty', async () => {
    server.use(
      // A plain Response, not HttpResponse: HttpResponse fills in a default
      // reason phrase for the status code, masking the real-world case this
      // guards — HTTP/2 (Vercel) responses always carry an empty statusText.
      http.get(
        '/api/tmdb/movie/550',
        () => new Response('Bad gateway page', { status: 502 }),
      ),
    );

    await expect(tmdbFetch('/movie/550')).rejects.toMatchObject({
      status: 502,
      message: 'Request failed (502)',
    });
  });
});
