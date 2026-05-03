import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { AuthShell } from '../components/AuthShell';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { useSignupCode } from '../hooks/useSignupCode';

const codeInputClass =
  'h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-raised)] px-3 text-base text-[var(--fg-1)] outline-none transition-colors focus:border-vesper-400 focus-visible:shadow-[0_0_0_3px_theme(colors.vesper.100)] font-mono uppercase tracking-widest';

export function SignupCodePage(): JSX.Element {
  const f = useSignupCode();

  return (
    <AuthShell>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void f.submit();
        }}
        className="flex flex-col"
      >
        <Field label="Invite code" {...(f.error ? { error: f.error } : {})}>
          <input
            aria-label="Invite code"
            value={f.code}
            onChange={(e) => f.setCode(e.target.value)}
            maxLength={5}
            className={codeInputClass}
          />
        </Field>
        <Button type="submit" size="lg" disabled={f.submitting}>
          {f.submitting ? 'Checking…' : 'Continue'}
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
