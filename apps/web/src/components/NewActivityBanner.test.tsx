import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NewActivityBanner } from './NewActivityBanner';

describe('NewActivityBanner', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(<NewActivityBanner visible={false} onRefresh={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the banner text when visible', () => {
    render(<NewActivityBanner visible={true} onRefresh={vi.fn()} />);
    expect(screen.getByText(/new activity/i)).toBeInTheDocument();
  });

  it('fires onRefresh when clicked', async () => {
    const onRefresh = vi.fn();
    render(<NewActivityBanner visible={true} onRefresh={onRefresh} />);
    await userEvent.click(screen.getByRole('button', { name: /new activity/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
