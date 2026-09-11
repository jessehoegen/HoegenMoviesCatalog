import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './app/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BrowsePage } from './features/browse/BrowsePage';
import { SearchPage } from './features/search/SearchPage';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/browse" replace />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/movie/:id" element={<div>Detail placeholder</div>} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
