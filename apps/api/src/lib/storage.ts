import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

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
  };
}
