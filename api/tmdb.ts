// Vercel Edge function: the TMDB proxy's entry point. Server-side only.
// Unrelated to src/api/, which is browser code that calls this endpoint.
// The logic lives in server/tmdbProxy.ts so its tests can sit outside api/ —
// every file in this directory becomes a public endpoint.
import { handleTmdbProxy } from '../server/tmdbProxy';

export const config = { runtime: 'edge' };

export default function handler(request: Request): Promise<Response> {
  // Read each variable by name rather than passing process.env whole: the Edge
  // runtime exposes variables by name, not as an enumerable object.
  return handleTmdbProxy(request, {
    TMDB_TOKEN: process.env.TMDB_TOKEN,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  });
}
