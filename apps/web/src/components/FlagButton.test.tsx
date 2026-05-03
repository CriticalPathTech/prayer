import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlagButton } from './FlagButton';

const apiFetchMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetchMock(...a) };
});

describe('FlagButton', () => {
  beforeEach(() => apiFetchMock.mockReset());
  afterEach(() => apiFetchMock.mockReset());

  it('opens the modal on click', async () => {
    render(<FlagButton targetType="post" postId="p1" targetId="p1" />);
    await userEvent.click(screen.getByRole('button', { name: /report/i }));
    expect(screen.getByRole('dialog', { name: /report content/i })).toBeInTheDocument();
  });
});
