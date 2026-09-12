import { Link, useLocation } from 'react-router-dom';
import { signInPath } from '../features/auth/signInPath';
import { useSession } from '../features/auth/useSession';
import { withRegion } from './useRegion';

// On these pages a "Sign in" link would point at the page you're already on,
// and replace its ?next= with the sign-in page itself.
const AUTH_PAGES = ['/sign-in', '/auth/callback'];

const LINK_CLASSES = 'text-sm text-neutral-300 hover:text-neutral-100 hover:underline';

export function AccountNav({ region }: { region: string }) {
  const session = useSession();
  const location = useLocation();

  // Nothing while loading, so a signed-in user never sees "Sign in" flash.
  if (session.status === 'loading') return null;

  if (session.status === 'signed-in') {
    return (
      <nav aria-label="Account" className="flex gap-4">
        <Link to={withRegion('/lists', region)} className={LINK_CLASSES}>
          My lists
        </Link>
        <Link to={withRegion('/account', region)} className={LINK_CLASSES}>
          Account
        </Link>
      </nav>
    );
  }

  if (AUTH_PAGES.includes(location.pathname)) return null;

  return (
    <Link
      to={signInPath(region, location.pathname + location.search)}
      className={LINK_CLASSES}
    >
      Sign in
    </Link>
  );
}
