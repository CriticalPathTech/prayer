import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EMPTY_DRAFT } from '../lib/mod-followup-pills';

import { ModFollowupSearch } from './ModFollowupSearch';

describe('ModFollowupSearch', () => {
  it('renders all six pills', () => {
    render(<ModFollowupSearch initial={EMPTY_DRAFT} onSearch={() => {}} />);
    expect(screen.getByRole('button', { name: 'No prayers for 24 hours' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No prayers for 3 days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No comments for 5 days' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'No leadership reply for 7 days' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No updates for 14 days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stale 14 days' })).toBeInTheDocument();
  });

  it('tapping a pill pre-fills the form but does not call onSearch', async () => {
    const onSearch = vi.fn();
    render(<ModFollowupSearch initial={EMPTY_DRAFT} onSearch={onSearch} />);
    await userEvent.click(screen.getByRole('button', { name: 'No prayers for 3 days' }));
    expect((screen.getByLabelText(/no prayers/i) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/for at least/i) as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText(/unit/i) as HTMLSelectElement).value).toBe('days');
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('clicking Search calls onSearch with current draft', async () => {
    const onSearch = vi.fn();
    render(<ModFollowupSearch initial={EMPTY_DRAFT} onSearch={onSearch} />);
    await userEvent.click(screen.getByRole('button', { name: 'No prayers for 3 days' }));
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }));
    expect(onSearch).toHaveBeenCalledWith({
      filters: {
        noPrayers: true,
        noReactions: false,
        noComments: false,
        noUpdates: false,
        noModResponse: false,
      },
      minAge: { value: 3, unit: 'days' },
    });
  });

  it('editing a checkbox after a pill clears the active-pill highlight', async () => {
    render(<ModFollowupSearch initial={EMPTY_DRAFT} onSearch={() => {}} />);
    const pill = screen.getByRole('button', { name: 'No prayers for 3 days' });
    await userEvent.click(pill);
    expect(pill).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByLabelText(/no comments/i));
    expect(pill).toHaveAttribute('aria-pressed', 'false');
  });

  it('Reset clears the form and the highlight', async () => {
    const onSearch = vi.fn();
    render(<ModFollowupSearch initial={EMPTY_DRAFT} onSearch={onSearch} />);
    await userEvent.click(screen.getByRole('button', { name: 'Stale 14 days' }));
    await userEvent.click(screen.getByRole('button', { name: /^reset$/i }));
    expect((screen.getByLabelText(/no prayers/i) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/for at least/i) as HTMLInputElement).value).toBe('0');
    expect(onSearch).not.toHaveBeenCalled();
  });
});
