import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PostImages } from './PostImages';

function img(id: string, purged = false) {
  return {
    id,
    url: purged ? null : `full-${id}`,
    thumb_url: `thumb-${id}`,
    width: 10,
    height: 10,
    purged,
  };
}

describe('PostImages', () => {
  it('renders nothing when there are no images', () => {
    const { container } = render(<PostImages images={[]} variant="card" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('card variant shows only the cover thumb', () => {
    render(<PostImages images={[img('a'), img('b')]} variant="card" />);
    const rendered = screen.getAllByRole('img');
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toHaveAttribute('src', 'thumb-a');
  });

  it('detail variant shows every image at full size', () => {
    render(<PostImages images={[img('a'), img('b')]} variant="detail" />);
    const rendered = screen.getAllByRole('img');
    expect(rendered).toHaveLength(2);
    expect(rendered[0]).toHaveAttribute('src', 'full-a');
  });

  it('explains a purged image instead of rendering a broken one', () => {
    render(<PostImages images={[img('a', true)]} variant="detail" />);
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'thumb-a');
  });
});
