import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EMPTY_DRAFT } from '../lib/mod-followup-pills';

import { EngagementSummary } from './EngagementSummary';

const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600_000).toISOString();

describe('EngagementSummary', () => {
  it('renders only relative time when no filters were applied', () => {
    render(<EngagementSummary createdAt={tenDaysAgo} appliedFilters={EMPTY_DRAFT.filters} />);
    expect(screen.getByText(/posted .* ago/i)).toBeInTheDocument();
    expect(screen.queryByText(/0 prayers/)).not.toBeInTheDocument();
  });

  it('includes only the dimensions whose filter was applied', () => {
    render(
      <EngagementSummary
        createdAt={tenDaysAgo}
        appliedFilters={{ noPrayers: true, noReactions: false, noComments: true, noUpdates: false, noModResponse: true }}
      />,
    );
    expect(screen.getByText(/0 prayers/)).toBeInTheDocument();
    expect(screen.getByText(/0 comments/)).toBeInTheDocument();
    expect(screen.getByText(/no leadership reply/)).toBeInTheDocument();
    expect(screen.queryByText(/0 reactions/)).not.toBeInTheDocument();
  });
});
