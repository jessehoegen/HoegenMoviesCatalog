import { Navigate, useLocation } from 'react-router-dom';
import { useRegion } from '../../app/useRegion';
import { signInPath } from './signInPath';

/** Sends a signed-out visitor to sign in, and back to this page afterwards. */
export function SignInRedirect() {
  const location = useLocation();
  const { region } = useRegion();

  // replace: Back from the sign-in page must not land here and bounce again.
  return (
    <Navigate to={signInPath(region, location.pathname + location.search)} replace />
  );
}
