import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HideTombstone } from './HideTombstone';

describe('HideTombstone', () => {
  it('renders hidden-by-moderator message', () => {
    render(<HideTombstone kind="post" />);
    expect(screen.getByText(/hidden by a moderator/i)).toBeInTheDocument();
  });
});
