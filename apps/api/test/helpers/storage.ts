import type { StorageClient, StorageFileItem } from '../../src/lib/storage.js';

export interface InMemoryStorage extends StorageClient {
  objects: Record<string, Buffer>;
  uploadCalls: Array<{ bucket: string; path: string; contentType: string }>;
  removeCalls: Array<{ bucket: string; paths: string[] }>;
}

export function makeInMemoryStorage(): InMemoryStorage {
  const objects: Record<string, Buffer> = {};
  const uploadCalls: InMemoryStorage['uploadCalls'] = [];
  const removeCalls: InMemoryStorage['removeCalls'] = [];
  return {
    objects,
    uploadCalls,
    removeCalls,
    async upload(bucket, path, body, opts) {
      uploadCalls.push({ bucket, path, contentType: opts.contentType });
      objects[`${bucket}/${path}`] = body;
    },
    async remove(bucket, paths) {
      removeCalls.push({ bucket, paths });
      for (const p of paths) delete objects[`${bucket}/${p}`];
    },
    async list(bucket, prefix): Promise<StorageFileItem[]> {
      const full = `${bucket}/${prefix}`;
      return Object.keys(objects)
        .filter((k) => k.startsWith(full))
        .map((k) => ({ name: k.slice(full.length) }));
    },
  };
}
