import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { OrgLogo } from '../../lib/api';

import { LogoMark } from './LogoMark';

const useOrgLogoMock = vi.fn<() => OrgLogo | null>();
vi.mock('../../hooks/useOrgLogo', () => ({
  useOrgLogo: () => useOrgLogoMock(),
}));

describe('LogoMark', () => {
  it('renders the default prayer-hands icon when there is no custom logo', () => {
    useOrgLogoMock.mockReturnValue(null);
    const { container } = render(<LogoMark size={20} />);
    expect(container.querySelector('.logo-mark')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders the custom svg inline with no tint in original mode', () => {
    useOrgLogoMock.mockReturnValue({
      svg: '<svg data-testid="lcc" viewBox="0 0 10 10"><path d="M0 0"/></svg>',
      fillMode: 'original',
      color: null,
    });
    const { container } = render(<LogoMark size={20} />);
    const wrap = container.querySelector('.logo-mark');
    expect(wrap).not.toBeNull();
    expect(wrap?.classList.contains('logo-mark--tinted')).toBe(false);
    expect(wrap?.innerHTML).toContain('<svg');
  });

  it('applies the tint class and custom color', () => {
    useOrgLogoMock.mockReturnValue({
      svg: '<svg viewBox="0 0 10 10"><path d="M0 0"/></svg>',
      fillMode: 'custom',
      color: '#123456',
    });
    const { container } = render(<LogoMark size={24} />);
    const wrap = container.querySelector('.logo-mark') as HTMLElement;
    expect(wrap.classList.contains('logo-mark--tinted')).toBe(true);
    expect(wrap.style.color).toBe('rgb(18, 52, 86)');
  });

  it('tints in adaptive mode without forcing a color (inherits currentColor)', () => {
    useOrgLogoMock.mockReturnValue({
      svg: '<svg viewBox="0 0 10 10"><path d="M0 0"/></svg>',
      fillMode: 'adaptive',
      color: null,
    });
    const { container } = render(<LogoMark size={24} />);
    const wrap = container.querySelector('.logo-mark') as HTMLElement;
    expect(wrap.classList.contains('logo-mark--tinted')).toBe(true);
    expect(wrap.style.color).toBe('');
  });
});
