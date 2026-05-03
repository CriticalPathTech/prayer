import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders initials when name is provided and no avatarUrl/email', () => {
    render(<Avatar name="Ben" />);
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('falls back to ? when name is null', () => {
    render(<Avatar name={null} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders anonymous icon when anonymous is true', () => {
    render(<Avatar name="Ben" anonymous />);
    expect(screen.getByLabelText(/anonymous/i)).toBeInTheDocument();
  });

  it('renders uploaded avatar as an img with transforms when avatarUrl is provided', () => {
    render(
      <Avatar
        name="Ben"
        avatarUrl="https://example.supabase.co/storage/v1/object/public/avatars/x.webp"
        size="md"
      />,
    );
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.src).toContain('?width=72&height=72&resize=cover');
  });

  it('falls through to Gravatar when avatarUrl img errors and email provided', () => {
    render(
      <Avatar
        name="Ben"
        email="ben@example.com"
        avatarUrl="https://example.supabase.co/bad.webp"
      />,
    );
    const img = screen.getByRole('img') as HTMLImageElement;
    fireEvent.error(img);
    const after = screen.getByRole('img') as HTMLImageElement;
    expect(after.src).toContain('gravatar.com/avatar/');
  });

  it('falls through to initials when Gravatar img errors', () => {
    render(<Avatar name="Ben" email="ben@example.com" />);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.src).toContain('gravatar.com/avatar/');
    fireEvent.error(img);
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('skips Gravatar tier when no email is provided', () => {
    render(<Avatar name="Ben" avatarUrl="https://example.supabase.co/bad.webp" />);
    const img = screen.getByRole('img') as HTMLImageElement;
    fireEvent.error(img);
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('supports xl size (128px)', () => {
    render(<Avatar name="Ben" size="xl" />);
    const el = screen.getByText('B').closest('div')!;
    expect(el.className).toMatch(/h-32 w-32/);
  });
});
