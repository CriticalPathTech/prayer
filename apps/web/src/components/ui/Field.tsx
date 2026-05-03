import type { JSX, ReactElement, ReactNode } from 'react';
import { Children, cloneElement, isValidElement } from 'react';

/** Default Tailwind class for text/password inputs paired with `<Field>`. */
export const inputClass =
  'h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-raised)] px-3 text-sm text-[var(--fg-1)] outline-none transition-colors focus:border-vesper-400 focus-visible:shadow-[0_0_0_3px_theme(colors.vesper.100)]';

export interface FieldProps {
  label?: string;
  help?: string;
  error?: string;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function Field({
  label,
  help,
  error,
  children,
  className = '',
  id,
}: FieldProps): JSX.Element {
  const errorId = id && error ? `${id}-error` : undefined;

  const enhancedChildren = errorId
    ? Children.map(children, (child) => {
        if (isValidElement(child)) {
          return cloneElement(child as ReactElement<Record<string, unknown>>, {
            'aria-describedby': errorId,
          });
        }
        return child;
      })
    : children;

  return (
    <div className={['flex flex-col gap-1.5 mb-4', className].filter(Boolean).join(' ')}>
      {label ? <div className="text-[13px] font-medium text-[var(--fg-2)]">{label}</div> : null}
      {enhancedChildren}
      {error ? (
        <div id={errorId} role="alert" className="text-xs text-ember-600">
          {error}
        </div>
      ) : help ? (
        <div className="text-xs text-[var(--fg-3)]">{help}</div>
      ) : null}
    </div>
  );
}
