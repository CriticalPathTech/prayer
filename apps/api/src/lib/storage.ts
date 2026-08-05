import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageUploadOptions {
  contentType: string;
}

export interface StorageFileItem {
  name: string;
}

/**
 * Narrow interface over the S3 operations we use. Lets tests inject
 * an in-memory fake without pulling the AWS SDK.
 */
export interface StorageClient {
  upload(bucket: string, path: string, body: Buffer, opts: StorageUploadOptions): Promise<void>;
  remove(bucket: string, paths: string[]): Promise<void>;
  list(bucket: string, prefix: string): Promise<StorageFileItem[]>;
  /**
   * Mint a time-limited GET URL for a private object. Used for post images,
   * which live in a bucket with public access blocked — the API is the only
   * thing that can hand out a readable URL, and only after the caller has
   * passed the membership + org checks.
   */
  presignGet(bucket: string, path: string, ttlSeconds: number): Promise<string>;
}

export interface StorageClientConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export function createStorageClient(cfg: StorageClientConfig): StorageClient {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: cfg.forcePathStyle,
  });

  return {
    async upload(bucket, path, body, opts) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: path,
          Body: body,
          ContentType: opts.contentType,
        }),
      );
    },
    async remove(bucket, paths) {
      if (paths.length === 0) return;
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: paths.map((Key) => ({ Key })) },
        }),
      );
    },
    async list(bucket, prefix) {
      const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
      const objects = res.Contents ?? [];
      return (
        objects
          .map((o) => o.Key)
          .filter((k): k is string => typeof k === 'string')
          // S3 returns full keys including the prefix; the prior Supabase impl
          // returned just the basename. Preserve that contract.
          .map((k) => (k.startsWith(prefix) ? k.slice(prefix.length).replace(/^\//, '') : k))
          .filter((name) => name.length > 0)
          .map((name) => ({ name }))
      );
    },
    async presignGet(bucket, path, ttlSeconds) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: path }), {
        expiresIn: ttlSeconds,
      });
    },
  };
}
