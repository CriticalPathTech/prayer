import type { JSX, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

export function ProtectedRoute({ children }: { children: ReactNode }): JSX.Element {
  const { session, loading, needsOnboarding } = useAuth();
  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (needsOnboarding) return <Navigate to="/signup" replace />;
  return <>{children}</>;
}
