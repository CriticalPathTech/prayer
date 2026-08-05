import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ImageTray } from './ImageTray';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, uploadPostImage: vi.fn(), deletePostImage: vi.fn() };
});

const api = await import('../lib/api');

function img(id: string) {
  return { id, url: `full-${id}`, thumb_url: `thumb-${id}`, width: 10, height: 10, purged: false };
}

function pick(file: File) {
  fireEvent.change(screen.getByLabelText(/add photo/i), { target: { files: [file] } });
}

describe('ImageTray', () => {
  it('renders the add tile and no thumbnails when empty', () => {
    render(<ImageTray images={[]} onChange={() => {}} />);
    expect(screen.getByLabelText(/add photo/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('labels the first image as the cover photo', () => {
    render(<ImageTray images={[img('a'), img('b')]} onChange={() => {}} />);
    expect(screen.getByText(/cover photo/i)).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('hides the add tile at three images', () => {
    render(<ImageTray images={[img('a'), img('b'), img('c')]} onChange={() => {}} />);
    expect(screen.queryByLabelText(/add photo/i)).not.toBeInTheDocument();
  });

  it('uploads a picked file and reports the new list', async () => {
    vi.mocked(api.uploadPostImage).mockResolvedValue(img('new'));
    const onChange = vi.fn();
    render(<ImageTray images={[]} onChange={onChange} />);

    pick(new File([new Uint8Array([1])], 'p.jpg', { type: 'image/jpeg' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([img('new')]));
  });

  it('shows an error and a retry affordance when upload fails', async () => {
    vi.mocked(api.uploadPostImage).mockRejectedValue(new Error('nope'));
    render(<ImageTray images={[]} onChange={() => {}} />);

    pick(new File([new Uint8Array([1])], 'p.jpg', { type: 'image/jpeg' }));

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('removes an image server-side and reports the new list', async () => {
    vi.mocked(api.deletePostImage).mockResolvedValue(undefined);
    const onChange = vi.fn();
    render(<ImageTray images={[img('a'), img('b')]} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole('button', { name: /remove photo/i })[0]!);

    await waitFor(() => expect(api.deletePostImage).toHaveBeenCalledWith('a'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([img('b')]));
  });
});
