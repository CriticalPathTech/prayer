import { z } from 'zod';

const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .default('3001')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive()),
  DATABASE_URL: z.string().url(),
  AUTH_JWKS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((v) => v === 'true')
    .pipe(z.boolean()),
  STORAGE_PUBLIC_URL_BASE: z.string().url(),
  // Comma-separated list of allowed origins. Each entry is validated as a URL.
  CORS_ORIGIN: z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().url()).min(1)),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  GIT_SHA: z.string().default('local-dev'),
  RATE_LIMIT_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true')
    .pipe(z.boolean()),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const patched = {
    ...source,
    GIT_SHA: source.GIT_SHA || source.RAILWAY_GIT_COMMIT_SHA || undefined,
  };
  const result = apiEnvSchema.safeParse(patched);
  if (!result.success) {
    const formatted = JSON.stringify(result.error.format(), null, 2);
    throw new Error(`Invalid environment variables:\n${formatted}`);
  }
  return result.data;
}
