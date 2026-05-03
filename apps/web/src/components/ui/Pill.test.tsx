import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Pill } from './Pill';

describe('Pill', () => {
  it('renders text content', () => {
    render(<Pill>Answered</Pill>);
    expect(screen.getByText('Answered')).toBeInTheDocument();
  });
  it('renders a leading icon when provided', () => {
    const { container } = render(<Pill leadingIcon="sunrise">Answered</Pill>);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
