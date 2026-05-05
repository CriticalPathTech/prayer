import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MobileAuthHeader } from './MobileAuthHeader';

describe('MobileAuthHeader', () => {
  it('renders the Prayer brand wordmark by default', () => {
    render(<MobileAuthHeader />);
    expect(screen.getByText('Prayer')).toBeInTheDocument();
  });

  it('uses an aria-hidden icon next to the wordmark', () => {
    const { container } = render(<MobileAuthHeader />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('renders the wordmark prop when provided', () => {
    render(<MobileAuthHeader wordmark="Hope Community Church" />);
    expect(screen.getByText('Hope Community Church')).toBeInTheDocument();
    expect(screen.queryByText('Prayer')).not.toBeInTheDocument();
  });
});
