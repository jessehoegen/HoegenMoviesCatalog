import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './app/Layout';
import { useRegion, withRegion } from './app/useRegion';
import { AccountPage } from './features/account/AccountPage';
import { AuthCallbackPage } from './features/auth/AuthCallbackPage';
import { SignInPage } from './features/auth/SignInPage';
import { BrowsePage } from './features/browse/BrowsePage';
import { MovieDetailPage } from './features/movie/MovieDetailPage';
import { SearchPage } from './features/search/SearchPage';
import { ListsPage } from './features/lists/ListsPage';

function NotFound() {
  const { region } = useRegion();

  return (
    <div className="py-16 text-center">
      <p className="text-neutral-300">That page does not exist.</p>
      <Link
        to={withRegion('/browse', region)}
        className="mt-4 inline-block text-sm text-neutral-400 underline"
      >
        Back to the catalog
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/*
        Every route renders inside Layout, the catch-all included: an unmatched
        path used to match nothing at all, so Routes rendered null and the user
        got a blank page with no header and no way back.
      */}
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/browse" replace />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/movie/:id" element={<MovieDetailPage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/lists" element={<ListsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
