import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PinnedByRibbon } from './PinnedByRibbon';

describe('PinnedByRibbon', () => {
  it('renders "Pinned by <name>" when pinnedBy is set', () => {
    render(<PinnedByRibbon pinnedBy={{ id: 'm1', display_name: 'Pastor Jon' }} />);
    expect(screen.getByText(/Pinned/i)).toBeInTheDocument();
    expect(screen.getByText('Pastor Jon')).toBeInTheDocument();
  });

  it('renders just "Pinned" when pinnedBy is null', () => {
    render(<PinnedByRibbon pinnedBy={null} />);
    expect(screen.getByText(/^Pinned$/i)).toBeInTheDocument();
  });
});
