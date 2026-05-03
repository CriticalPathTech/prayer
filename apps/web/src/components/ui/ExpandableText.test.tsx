import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ExpandableText } from './ExpandableText';

describe('ExpandableText', () => {
  it('renders text in full when shorter than threshold', () => {
    render(<ExpandableText text="short body" threshold={50} />);
    expect(screen.getByText('short body')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });

  it('trims and shows a Show more button when longer than threshold', () => {
    const long = 'a'.repeat(60);
    render(<ExpandableText text={long} threshold={20} />);
    expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
    // Trimmed text ends with the ellipsis character
    const para = screen.getByText(/a{20}…$/);
    expect(para).toBeInTheDocument();
  });

  it('expands to full text and hides Show more when clicked', async () => {
    const long = 'a'.repeat(60);
    render(<ExpandableText text={long} threshold={20} />);
    await userEvent.click(screen.getByRole('button', { name: /show more/i }));
    expect(screen.getByText('a'.repeat(60))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });

  it('renders text equal to threshold without a button', () => {
    const exact = 'a'.repeat(20);
    render(<ExpandableText text={exact} threshold={20} />);
    expect(screen.getByText(exact)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });
});
