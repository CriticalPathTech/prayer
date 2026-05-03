import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ModTabs } from './ModTabs';

describe('ModTabs', () => {
  it('underlines the Queue tab when on /mod/queue', () => {
    render(
      <MemoryRouter initialEntries={['/mod/queue']}>
        <ModTabs />
      </MemoryRouter>,
    );
    const queue = screen.getByRole('link', { name: /queue/i });
    expect(queue.className).toMatch(/underline/);
    const invites = screen.getByRole('link', { name: /invites/i });
    expect(invites.className).not.toMatch(/underline/);
  });

  it('underlines the Invites tab when on /mod/invites', () => {
    render(
      <MemoryRouter initialEntries={['/mod/invites']}>
        <ModTabs />
      </MemoryRouter>,
    );
    const invites = screen.getByRole('link', { name: /invites/i });
    expect(invites.className).toMatch(/underline/);
  });
});
