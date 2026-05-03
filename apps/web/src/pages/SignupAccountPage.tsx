import type { JSX } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { AuthShell } from '../components/AuthShell';
import { Button } from '../components/ui/Button';
import { Field, inputClass } from '../components/ui/Field';
import { useSignupAccount } from '../hooks/useSignupAccount';

export function SignupAccountPage(): JSX.Element {
  const [params] = useSearchParams();
  const code = params.get('code') ?? '';
  const f = useSignupAccount(code);

  if (f.preview.kind === 'loading') {
    return (
      <AuthShell>
        <p className="text-sm text-[var(--fg-3)]">Checking your invite…</p>
      </AuthShell>
    );
  }

  if (f.preview.kind === 'error') {
    return (
      <AuthShell>
        <p className="mb-4 text-sm text-ember-600">{f.preview.message}</p>
        <Link to="/signup" className="text-sm font-medium text-vesper-700 hover:underline">
          Try another code
        </Link>
      </AuthShell>
    );
  }

  if (f.alreadyRegistered) {
    return (
      <AuthShell>
        <h1 className="mb-2 font-serif text-[22px] font-semibold text-[var(--fg-1)]">
          Already registered
        </h1>
        <p className="mb-4 text-sm text-[var(--fg-3)]">
          An account with this email already exists.
        </p>
        <p className="text-sm text-[var(--fg-3)]">
          <Link to="/login" className="font-medium text-vesper-700 hover:underline">
            Sign in
          </Link>{' '}
          ·{' '}
          <Link
            to={`/forgot-password?email=${encodeURIComponent(f.email)}`}
            className="font-medium text-vesper-700 hover:underline"
          >
            Reset password
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void f.submit();
        }}
        className="flex flex-col"
      >
        <Field label="Email" id="signup-email">
          <input
            id="signup-email"
            type="email"
            aria-label="Email"
            value={f.email}
            onChange={(e) => f.setEmail(e.target.value)}
            className={inputClass}
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Password" id="signup-password">
          <input
            id="signup-password"
            type="password"
            aria-label="Password"
            value={f.password}
            onChange={(e) => f.setPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Field
          label="Confirm password"
          id="signup-confirm"
          {...(f.passwordError ? { error: f.passwordError } : {})}
        >
          <input
            id="signup-confirm"
            type="password"
            aria-label="Confirm password"
            value={f.confirm}
            onChange={(e) => f.setConfirm(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        {f.formError ? (
          <div role="alert" className="mb-3 text-xs text-ember-600">
            {f.formError}
          </div>
        ) : null}
        <Button type="submit" size="lg" disabled={f.submitting}>
          {f.submitting ? 'Signing up…' : 'Sign up'}
        </Button>
      </form>
      <p className="mt-5 text-xs text-[var(--fg-3)]">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-vesper-700 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
