import type { JSX } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { Field, inputClass } from '../../components/ui/Field';
import { useAuth } from '../../hooks/useAuth';
import { useLogin } from '../../hooks/useLogin';
import { useOrgBranding } from '../../hooks/useOrgBranding';

import { MobileAuthHeader } from './MobileAuthHeader';

export function MobileLoginPage(): JSX.Element {
  const { session, loading, needsOnboarding } = useAuth();
  const f = useLogin();
  const { displayName: orgDisplayName } = useOrgBranding();

  if (loading) {
    return <div className="p-6 font-sans text-[var(--fg-3)]">Loading…</div>;
  }
  if (session && !needsOnboarding) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen flex-col items-center bg-[var(--bg-page)] px-4 pb-6 font-sans text-[var(--fg-2)]">
      <MobileAuthHeader wordmark={orgDisplayName ?? 'Prayer'} />
      <div className="w-full max-w-sm">
        <p className="mb-4 text-[13px] text-[var(--fg-3)]">Carrying each other in prayer.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void f.submit();
          }}
          className="flex flex-col"
        >
          <Field label="Email">
            <input
              type="email"
              required
              aria-label="Email"
              value={f.email}
              onChange={(e) => f.setEmail(e.target.value)}
              className={inputClass}
              autoComplete="email"
            />
          </Field>
          <Field label="Password" {...(f.errorMessage ? { error: f.errorMessage } : {})}>
            <input
              type="password"
              required
              aria-label="Password"
              value={f.password}
              onChange={(e) => f.setPassword(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
            />
          </Field>
          <Button type="submit" size="lg" disabled={f.submitting}>
            {f.submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-2 text-xs">
          <Link to="/forgot-password" className="text-[var(--fg-3)] hover:underline">
            Forgot your password?
          </Link>
        </p>
        <p className="mt-5 text-xs text-[var(--fg-3)]">
          New here?{' '}
          <Link to="/signup" className="font-medium text-vesper-700 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
