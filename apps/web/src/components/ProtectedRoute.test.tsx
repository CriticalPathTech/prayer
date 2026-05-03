import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ProtectedRoute } from './ProtectedRoute';

const useAuthMock = vi.fn();
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/signup" element={<div>signup page</div>} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div>home page</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('renders a loading indicator while auth is loading', () => {
    useAuthMock.mockReturnValue({ session: null, loading: true, needsOnboarding: false });
    renderAt('/');
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('redirects to /login when there is no session', () => {
    useAuthMock.mockReturnValue({ session: null, loading: false, needsOnboarding: false });
    renderAt('/');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('renders children when a session exists', () => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'u1' } },
      loading: false,
      needsOnboarding: false,
    });
    renderAt('/');
    expect(screen.getByText('home page')).toBeInTheDocument();
  });

  it('redirects to /signup when session exists but needsOnboarding is true', () => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'u1' } },
      loading: false,
      needsOnboarding: true,
    });
    renderAt('/');
    expect(screen.getByText('signup page')).toBeInTheDocument();
  });
});
