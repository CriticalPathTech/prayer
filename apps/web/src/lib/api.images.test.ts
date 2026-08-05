import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deletePostImage, uploadPostImage } from './api';

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } },
}));

describe('post image api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts raw bytes with the file content type', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          image: { id: 'i1', url: 'u', thumb_url: 't', width: 10, height: 10, purged: false },
        }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File([new Uint8Array([1, 2, 3])], 'p.jpg', { type: 'image/jpeg' });
    const image = await uploadPostImage(file);

    expect(image.id).toBe('i1');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(file);
  });

  it('deletes by id', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 204,
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await deletePostImage('i1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/me/images/i1');
    expect(init?.method).toBe('DELETE');
  });
});
