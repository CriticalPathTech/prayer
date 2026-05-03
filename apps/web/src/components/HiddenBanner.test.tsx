import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HiddenBanner } from './HiddenBanner';

describe('HiddenBanner', () => {
  it('renders the member-facing copy by default', () => {
    render(<HiddenBanner kind="post" />);
    expect(screen.getByText(/hidden by a moderator/i)).toBeInTheDocument();
    expect(screen.getByText(/contact a moderator/i)).toBeInTheDocument();
  });

  it('renders "Hidden by <name>" when moderator view + manual source', () => {
    render(<HiddenBanner kind="post" moderatorView hiddenBy="Alice Example" source="manual" />);
    expect(screen.getByText(/Hidden by Alice Example/i)).toBeInTheDocument();
    expect(screen.getByText(/visible to moderators only/i)).toBeInTheDocument();
    expect(screen.queryByText(/contact a moderator/i)).not.toBeInTheDocument();
  });

  it('renders "Auto-hidden (2 flags)" when moderator view + auto source', () => {
    render(<HiddenBanner kind="post" moderatorView hiddenBy={null} source="auto" />);
    expect(screen.getByText(/Auto-hidden \(2 flags\)/i)).toBeInTheDocument();
    expect(screen.getByText(/visible to moderators only/i)).toBeInTheDocument();
  });

  it('falls back to "Hidden" when moderator view + no source metadata', () => {
    render(<HiddenBanner kind="post" moderatorView hiddenBy={null} source={null} />);
    expect(screen.getByText(/^Hidden\./)).toBeInTheDocument();
  });
});
