import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Icon } from './Icon';

describe('Icon', () => {
  it('renders an SVG for a known name at the default size', () => {
    const { container } = render(<Icon name="bell" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('width')).toBe('18');
    expect(svg?.getAttribute('height')).toBe('18');
  });

  it('accepts size 20', () => {
    const { container } = render(<Icon name="check" size={20} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('20');
  });

  it('sets aria-hidden by default', () => {
    const { container } = render(<Icon name="bell" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
