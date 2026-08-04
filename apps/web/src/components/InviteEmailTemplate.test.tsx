import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InviteEmailTemplate } from './InviteEmailTemplate';

const useAuthMock = vi.fn(() => ({ me: { orgDisplayName: 'Lakeside' } }) as unknown);
vi.mock('../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

describe('InviteEmailTemplate', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders nothing when the code has no seats left', () => {
    const { container } = render(<InviteEmailTemplate code="7QK2" seatsRemaining={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the template when a seat remains', () => {
    render(<InviteEmailTemplate code="7QK2" seatsRemaining={1} />);
    expect(screen.getByText('Email template')).toBeInTheDocument();
  });

  it('appends Church to the org name and includes the code and signup link', () => {
    render(<InviteEmailTemplate code="7QK2-M4PD" seatsRemaining={2} />);
    const body = screen.getByText(/I'd love for you to join/);
    expect(body).toHaveTextContent('Lakeside Church');
    expect(body).toHaveTextContent('7QK2-M4PD');
    expect(body).toHaveTextContent(`${window.location.origin}/signup`);
  });

  it('does not double up when the org name already ends with Church', () => {
    useAuthMock.mockReturnValue({ me: { orgDisplayName: 'Lakeside Church' } });
    render(<InviteEmailTemplate code="7QK2" seatsRemaining={1} />);
    expect(
      screen.getByText(/An invitation to the Lakeside Church prayer wall/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Church Church/)).not.toBeInTheDocument();
  });

  it('copies the body to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<InviteEmailTemplate code="7QK2" seatsRemaining={1} />);
    await userEvent.click(screen.getByRole('button', { name: /copy email body/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]![0]).toContain('7QK2');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('copies the subject separately from the body', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<InviteEmailTemplate code="7QK2" seatsRemaining={1} />);
    await userEvent.click(screen.getByRole('button', { name: /copy email subject/i }));
    expect(writeText.mock.calls[0]![0]).toBe('An invitation to the Lakeside Church prayer wall');
  });
});
