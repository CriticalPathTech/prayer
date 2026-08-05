import { describe, expect, it } from 'vitest';

import { makeInMemoryStorage } from '../helpers/storage.js';

describe('fake storage presignGet', () => {
  it('returns a distinct url per key and throws for a missing object', async () => {
    const storage = makeInMemoryStorage();
    await storage.upload('post-images', 'posts/a.webp', Buffer.from('a'), {
      contentType: 'image/webp',
    });

    const url = await storage.presignGet('post-images', 'posts/a.webp', 900);
    expect(url).toContain('posts/a.webp');

    await expect(storage.presignGet('post-images', 'posts/missing.webp', 900)).rejects.toThrow();
  });
});
