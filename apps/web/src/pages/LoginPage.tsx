import type { JSX } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { Field, inputClass } from '../components/ui/Field';
import { Icon } from '../components/ui/Icon';
import { useAuth } from '../hooks/useAuth';
import { useLogin } from '../hooks/useLogin';

export function LoginPage(): JSX.Element {
  const { session, loading, needsOnboarding } = useAuth();
  const f = useLogin();

  if (loading) return <div className="p-6 text-[var(--fg-3)] font-sans">Loading…</div>;
  if (session && !needsOnboarding) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-[var(--bg-page)] font-sans text-[var(--fg-2)] relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <Icon name="pray" size={32} className="opacity-[0.06] scale-[8.75]" />
      </div>
      <div className="relative z-10 mx-auto mt-24 max-w-sm rounded-lg border border-[var(--border-soft)] bg-[var(--bg-raised)] p-7 shadow-warm-sm">
        <div className="mb-5 inline-flex items-center gap-2.5 font-serif font-semibold text-[28px] tracking-[-0.02em] text-[var(--fg-1)]">
          <Icon name="pray" size={24} />
          <span>Prayer</span>
        </div>
        <p className="mb-4 text-[13px] text-[var(--fg-3)]">An invite-only community.</p>
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
              value={f.email}
              onChange={(e) => f.setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Password" {...(f.errorMessage ? { error: f.errorMessage } : {})}>
            <input
              type="password"
              required
              value={f.password}
              onChange={(e) => f.setPassword(e.target.value)}
              className={inputClass}
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
