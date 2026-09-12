import type { TmdbErrorBody } from './types';

// The same-origin proxy (api/tmdb.ts, server-side) adds the TMDB token. The
// browser never holds it, so nothing here sends an Authorization header.
// Despite the similar name, this file is browser code, unrelated to the root
// api/ directory.
const BASE_URL = '/api/tmdb';

export type TmdbParams = Record<string, string | number | undefined>;

export class TmdbError extends Error {
  readonly status: number;
  readonly statusCode: number | undefined;

  constructor(status: number, message: string, statusCode?: number) {
    super(message);
    this.name = 'TmdbError';
    this.status = status;
    this.statusCode = statusCode;
  }
}

export async function tmdbFetch<T>(path: string, params: TmdbParams = {}): Promise<T> {
  // BASE_URL is relative, and new URL() rejects a relative URL without a base.
  const url = new URL(BASE_URL + path, window.location.origin);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: { accept: 'application/json' },
  });

  // fetch does not reject on 4xx/5xx. Without this check a failed request
  // resolves as a successful one carrying malformed data.
  if (!response.ok) {
    let message = response.statusText;
    let statusCode: number | undefined;

    try {
      const body = (await response.json()) as TmdbErrorBody;
      message = body.status_message ?? message;
      statusCode = body.status_code;
    } catch {
      // Error body was not JSON; keep the status text.
    }

    throw new TmdbError(response.status, message, statusCode);
  }

  return (await response.json()) as T;
}
