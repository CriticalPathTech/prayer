import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStorageClient, type StorageClient } from '../../src/lib/storage.js';

// S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY come from global-setup and match
// the MinIO dev credentials (prayer-dev-local / prayer-dev-local-secret).
const ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const ACCESS_KEY = process.env.S3_ACCESS_KEY ?? 'prayer-dev-local';
const SECRET_KEY = process.env.S3_SECRET_KEY ?? 'prayer-dev-local-secret';
const TEST_BUCKET = `prayer-storage-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Probe MinIO reachability at module load. If unreachable, the suite
// is skipped — local devs without docker compose up can run pnpm test
// without setting up MinIO themselves.
const probe = async (): Promise<string | null> => {
  try {
    const res = await fetch(`${ENDPOINT}/minio/health/live`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok ? null : `MinIO health check returned ${res.status}`;
  } catch (err) {
    return `MinIO unreachable at ${ENDPOINT}: ${(err as Error).message}`;
  }
};

const skipReason = await probe();

const s3Config: S3ClientConfig = {
  endpoint: ENDPOINT,
  region: 'us-east-1',
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  forcePathStyle: true,
};

let rawClient: S3Client;
let storage: StorageClient;

describe.skipIf(skipReason !== null)(
  `createStorageClient against real MinIO${skipReason ? ` [SKIPPED: ${skipReason}]` : ''}`,
  () => {
    beforeAll(async () => {
      rawClient = new S3Client(s3Config);
      await rawClient.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }));
      storage = createStorageClient({
        endpoint: ENDPOINT,
        region: 'us-east-1',
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
        forcePathStyle: true,
      });
    });

    afterAll(async () => {
      if (!rawClient) return;
      // Empty + delete the test bucket
      const listed = await rawClient.send(new ListObjectsV2Command({ Bucket: TEST_BUCKET }));
      const objects = (listed.Contents ?? []).filter(
        (o): o is { Key: string } => typeof o.Key === 'string',
      );
      if (objects.length > 0) {
        await rawClient.send(
          new DeleteObjectsCommand({
            Bucket: TEST_BUCKET,
            Delete: { Objects: objects.map((o) => ({ Key: o.Key })) },
          }),
        );
      }
      await rawClient.send(new DeleteBucketCommand({ Bucket: TEST_BUCKET }));
      rawClient.destroy();
    });

    it('upload + list + remove round-trip', async () => {
      const body = Buffer.from('hello world', 'utf8');
      await storage.upload(TEST_BUCKET, 'avatars/u1/avatar.txt', body, {
        contentType: 'text/plain',
      });

      const items = await storage.list(TEST_BUCKET, 'avatars/u1/');
      expect(items).toEqual([{ name: 'avatar.txt' }]);

      await storage.remove(TEST_BUCKET, ['avatars/u1/avatar.txt']);

      const empty = await storage.list(TEST_BUCKET, 'avatars/u1/');
      expect(empty).toEqual([]);
    });

    it('overwrites existing object on upload (S3 PutObject is always idempotent)', async () => {
      const path = 'avatars/u2/photo.txt';
      await storage.upload(TEST_BUCKET, path, Buffer.from('first'), {
        contentType: 'text/plain',
      });
      await storage.upload(TEST_BUCKET, path, Buffer.from('second'), {
        contentType: 'text/plain',
      });
      const items = await storage.list(TEST_BUCKET, 'avatars/u2/');
      expect(items).toEqual([{ name: 'photo.txt' }]);
    });

    it('list returns basenames stripped of the prefix', async () => {
      await storage.upload(TEST_BUCKET, 'avatars/u3/a.txt', Buffer.from('a'), {
        contentType: 'text/plain',
      });
      await storage.upload(TEST_BUCKET, 'avatars/u3/b.txt', Buffer.from('b'), {
        contentType: 'text/plain',
      });
      const items = await storage.list(TEST_BUCKET, 'avatars/u3/');
      expect(items.map((i) => i.name).sort()).toEqual(['a.txt', 'b.txt']);
      // Verify the prefix-stripping contract — names must not include 'avatars/u3/'
      items.forEach((i) => expect(i.name).not.toContain('/'));
    });

    it('remove on empty paths array is a no-op', async () => {
      // Should not throw
      await expect(storage.remove(TEST_BUCKET, [])).resolves.toBeUndefined();
    });
  },
);
