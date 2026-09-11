import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './app/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BrowsePage } from './features/browse/BrowsePage';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/browse" replace />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/search" element={<div>Search placeholder</div>} />
          <Route path="/movie/:id" element={<div>Detail placeholder</div>} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
