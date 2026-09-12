import { withRegion } from '../../app/useRegion';

/** The sign-in page, set to return to `next` afterwards. */
export function signInPath(region: string, next: string): string {
  return withRegion('/sign-in', region, { next });
}
