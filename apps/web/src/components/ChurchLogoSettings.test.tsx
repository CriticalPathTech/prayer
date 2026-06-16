import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../lib/api';

import { ChurchLogoSettings } from './ChurchLogoSettings';

vi.mock('../hooks/useOrgLogo', () => ({
  useOrgLogo: () => null, // State 1: no custom logo yet
  useRefreshOrgLogo: () => async () => {},
}));

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#000" d="M0 0h10v10H0z"/></svg>';

describe('ChurchLogoSettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the default state with an upload control', () => {
    render(<ChurchLogoSettings />);
    expect(screen.getByText(/church logo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upload svg/i)).toBeInTheDocument();
  });

  it('previews an uploaded file then saves', async () => {
    const previewSpy = vi.spyOn(api, 'previewChurchLogo').mockResolvedValue({
      sanitizedSvg: SVG,
      warnings: { strippedTags: [], multiColor: false },
      detectedColors: ['#000000'],
    });
    const saveSpy = vi.spyOn(api, 'saveChurchLogo').mockResolvedValue({
      logo: { svg: SVG, fillMode: 'original', color: null },
    });

    render(<ChurchLogoSettings />);
    const file = new File([SVG], 'logo.svg', { type: 'image/svg+xml' });
    await userEvent.upload(screen.getByLabelText(/upload svg/i), file);

    await waitFor(() => expect(previewSpy).toHaveBeenCalled());
    const confirm = await screen.findByRole('button', { name: /confirm/i });
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ fillMode: 'original' })),
    );
  });

  it('warns when the preview reports a multi-color logo', async () => {
    vi.spyOn(api, 'previewChurchLogo').mockResolvedValue({
      sanitizedSvg: SVG,
      warnings: { strippedTags: [], multiColor: true },
      detectedColors: ['#000000', '#ffffff'],
    });
    render(<ChurchLogoSettings />);
    const file = new File([SVG], 'logo.svg', { type: 'image/svg+xml' });
    await userEvent.upload(screen.getByLabelText(/upload svg/i), file);
    expect(await screen.findByText(/may flatten detail/i)).toBeInTheDocument();
  });
});
