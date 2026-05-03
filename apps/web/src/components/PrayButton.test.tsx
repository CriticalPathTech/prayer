import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PrayButton } from './PrayButton';

describe('PrayButton', () => {
  it('shows "I Will Pray" before click', () => {
    render(<PrayButton prayed={false} prayerCount={0} onToggle={() => {}} />);
    expect(screen.getByRole('button')).toHaveTextContent(/I Will Pray/);
  });

  it('shows "Prayed" + "{N} praying" after click', () => {
    render(<PrayButton prayed={true} prayerCount={12} onToggle={() => {}} />);
    expect(screen.getByRole('button')).toHaveTextContent(/Prayed/);
    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/praying/)).toBeInTheDocument();
  });

  it('renders non-zero count even before click', () => {
    render(<PrayButton prayed={false} prayerCount={3} onToggle={() => {}} />);
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/praying/)).toBeInTheDocument();
  });

  it('does not render count when zero', () => {
    render(<PrayButton prayed={false} prayerCount={0} onToggle={() => {}} />);
    expect(screen.queryByText(/praying/)).not.toBeInTheDocument();
  });

  it('sets aria-pressed to true when prayed', () => {
    render(<PrayButton prayed prayerCount={1} onToggle={() => {}} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('fires onToggle on click', async () => {
    const onToggle = vi.fn();
    render(<PrayButton prayed={false} prayerCount={0} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalled();
  });
});
