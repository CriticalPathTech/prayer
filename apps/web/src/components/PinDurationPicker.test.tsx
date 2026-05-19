import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_PIN_DAYS, PIN_CHOICES, PinDurationPicker } from './PinDurationPicker';

describe('PinDurationPicker', () => {
  it('exports the documented default and choices', () => {
    expect(DEFAULT_PIN_DAYS).toBe(7);
    expect(PIN_CHOICES).toEqual([1, 3, 7, 14, 30]);
  });

  it('renders five radio options with the expected labels', () => {
    render(<PinDurationPicker value={7} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: '1 day' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '3 days' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '1 week' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '2 weeks' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '1 month' })).toBeInTheDocument();
  });

  it('marks the active radio with aria-checked=true', () => {
    render(<PinDurationPicker value={14} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: '2 weeks' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '1 week' })).toHaveAttribute('aria-checked', 'false');
  });

  it('fires onChange with the chosen day number', async () => {
    const onChange = vi.fn();
    render(<PinDurationPicker value={7} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: '1 month' }));
    expect(onChange).toHaveBeenCalledWith(30);
  });
});
