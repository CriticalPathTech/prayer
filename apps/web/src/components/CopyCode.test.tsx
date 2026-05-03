import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CopyCode } from './CopyCode';

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('CopyCode', () => {
  it('renders the code text', () => {
    render(<CopyCode code="de32s" />);
    expect(screen.getByText('de32s')).toBeInTheDocument();
  });

  it('writes to the clipboard on click and shows Copied state', async () => {
    render(<CopyCode code="de32s" />);
    await userEvent.click(screen.getByRole('button', { name: /copy invite code/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('de32s');
    await waitFor(() => expect(screen.getByText(/copied/i)).toBeInTheDocument());
  });

  it('swallows clipboard errors gracefully', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('blocked'));
    render(<CopyCode code="de32s" />);
    await userEvent.click(screen.getByRole('button', { name: /copy invite code/i }));
    // Still present, no unhandled rejection.
    expect(screen.getByText('de32s')).toBeInTheDocument();
  });
});
