import type { JSX } from 'react';

export interface HideTombstoneProps {
  kind: 'post' | 'comment';
}

export function HideTombstone({ kind }: HideTombstoneProps): JSX.Element {
  return (
    <div className="rounded border border-dashed bg-gray-50 p-3 text-sm italic text-gray-500">
      This {kind} was hidden by a moderator.
    </div>
  );
}
