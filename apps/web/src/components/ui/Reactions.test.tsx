import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Reactions } from './Reactions';

describe('Reactions', () => {
  it('renders non-zero reaction badges inline', () => {
    render(
      <Reactions
        ariaLabel="reactions"
        reactions={{ '🙏': { count: 3, mine: false }, '❤️': { count: 0, mine: false } }}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText('🙏')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('❤️')).not.toBeInTheDocument();
  });

  it('opens the picker on trigger click and shows all 6 emojis', async () => {
    render(<Reactions ariaLabel="reactions" reactions={{}} onToggle={() => {}} />);
    await userEvent.click(screen.getByLabelText('Add reaction'));
    for (const e of ['🙏', '❤️', '💪', '😢', '✝️', '🙌']) {
      expect(screen.getAllByText(e).length).toBeGreaterThan(0);
    }
  });

  it('fires onToggle with the picked emoji and closes picker', async () => {
    const onToggle = vi.fn();
    render(<Reactions ariaLabel="reactions" reactions={{}} onToggle={onToggle} />);
    await userEvent.click(screen.getByLabelText('Add reaction'));
    const picker = screen.getByRole('dialog', { name: 'reactions picker' });
    const heartBtn = picker.querySelector('button[aria-label="Love and support"]');
    expect(heartBtn).not.toBeNull();
    await userEvent.click(heartBtn!);
    expect(onToggle).toHaveBeenCalledWith('❤️');
    expect(screen.queryByRole('dialog', { name: 'reactions picker' })).not.toBeInTheDocument();
  });

  it('toggles an existing reaction when badge is clicked', async () => {
    const onToggle = vi.fn();
    render(
      <Reactions
        ariaLabel="reactions"
        reactions={{ '🙏': { count: 2, mine: true } }}
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByLabelText('Remove reaction: I am praying for this'));
    expect(onToggle).toHaveBeenCalledWith('🙏');
  });

  it('renders sentiment-based aria-labels on the picker buttons', () => {
    render(<Reactions reactions={{}} onToggle={() => {}} ariaLabel="Reactions" />);
    fireEvent.click(screen.getByRole('button', { name: /add reaction/i }));
    expect(screen.getByRole('button', { name: /praying for this/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /grieving with you/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /amen/i })).toBeInTheDocument();
  });

  it('hides the picker trigger when all 6 emojis already have reactions', () => {
    render(
      <Reactions
        ariaLabel="reactions"
        reactions={{
          '🙏': { count: 1, mine: false },
          '❤️': { count: 1, mine: false },
          '💪': { count: 1, mine: false },
          '😢': { count: 1, mine: false },
          '✝️': { count: 1, mine: false },
          '🙌': { count: 1, mine: false },
        }}
        onToggle={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /add reaction/i })).not.toBeInTheDocument();
  });

  it('shows the picker trigger again when one emoji drops back to 0', () => {
    render(
      <Reactions
        ariaLabel="reactions"
        reactions={{
          '🙏': { count: 1, mine: false },
          '❤️': { count: 1, mine: false },
          '💪': { count: 1, mine: false },
          '😢': { count: 1, mine: false },
          '✝️': { count: 1, mine: false },
          '🙌': { count: 0, mine: false },
        }}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /add reaction/i })).toBeInTheDocument();
  });
});
