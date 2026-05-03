import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AvatarCropDialog } from './AvatarCropDialog';

// react-easy-crop needs layout; mock down to a stub that fires onCropComplete
// once (via useEffect) so Save has deterministic crop data without an
// infinite re-render loop.
vi.mock('react-easy-crop', () => {
  const fixedPixels = { x: 0, y: 0, width: 200, height: 200 };
  type MockProps = {
    onCropComplete?: (area: unknown, pixels: typeof fixedPixels) => void;
  };
  function MockCropper({ onCropComplete }: MockProps): JSX.Element {
    useEffect(() => {
      onCropComplete?.({}, fixedPixels);
      // Intentionally run once — the real component's onCropComplete is a
      // fresh arrow each render, so keying on [onCropComplete] would loop.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="cropper" />;
  }
  return { default: MockCropper };
});

// jsdom has no real canvas/Image pipeline — mock the crop helper to return a
// deterministic webp data URL so we can assert the upload contract.
vi.mock('./avatarCrop', () => ({
  cropToWebpDataUrl: vi.fn(),
}));

vi.mock('../lib/api', () => ({ uploadMyAvatar: vi.fn() }));
const api = await import('../lib/api');
const crop = await import('./avatarCrop');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(crop.cropToWebpDataUrl).mockResolvedValue('data:image/webp;base64,AAAA');
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
    Object.defineProperty(this, 'result', { value: 'data:image/webp;base64,AAAA' });
    this.onload?.(new ProgressEvent('load') as unknown as ProgressEvent<FileReader>);
  });
});

describe('AvatarCropDialog', () => {
  it('opens empty (no cropper) until a file is chosen', () => {
    render(<AvatarCropDialog open onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByTestId('cropper')).toBeNull();
    expect(screen.getByRole('button', { name: /choose photo/i })).toBeInTheDocument();
  });

  it('calls uploadMyAvatar with base64 webp data on Save', async () => {
    vi.mocked(api.uploadMyAvatar).mockResolvedValueOnce({
      id: 'u1',
      email: 'a@e.com',
      display_name: 'A',
      avatar_url: 'https://example.supabase.co/new',
      role: 'member',
    } as never);
    const onSaved = vi.fn();

    render(<AvatarCropDialog open onClose={vi.fn()} onSaved={onSaved} />);
    const file = new File([new Uint8Array([0, 1, 2])], 'pic.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    await waitFor(() => screen.getByTestId('cropper'));

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(api.uploadMyAvatar).toHaveBeenCalledWith(
        expect.stringMatching(/^data:image\/webp;base64,/),
      ),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('renders error copy and keeps dialog open on API error', async () => {
    vi.mocked(api.uploadMyAvatar).mockRejectedValueOnce({
      code: 'STORAGE_ERROR',
      message: 'x',
    });
    const onClose = vi.fn();
    render(<AvatarCropDialog open onClose={onClose} onSaved={vi.fn()} />);
    const file = new File([new Uint8Array([0])], 'a.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    await waitFor(() => screen.getByTestId('cropper'));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(screen.getByText(/save your photo/i)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });
});
