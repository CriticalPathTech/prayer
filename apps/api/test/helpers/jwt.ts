import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { importPKCS8, SignJWT } from 'jose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRIVATE_KEY_PATH = path.resolve(__dirname, '../fixtures/test-private-key-pkcs8.pem');

let cachedKey: CryptoKey | null = null;

async function getPrivateKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const pem = readFileSync(PRIVATE_KEY_PATH, 'utf8');
  cachedKey = (await importPKCS8(pem, 'RS256')) as CryptoKey;
  return cachedKey;
}

export interface MintOptions {
  sub: string;
  email: string;
  expiresIn?: string;
  audience?: string;
}

export async function mintTestJwt(opts: MintOptions): Promise<string> {
  const key = await getPrivateKey();
  return new SignJWT({ email: opts.email })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
    .setSubject(opts.sub)
    .setAudience(opts.audience ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '1h')
    .sign(key);
}

export async function mintExpiredJwt(opts: Omit<MintOptions, 'expiresIn'>): Promise<string> {
  const key = await getPrivateKey();
  return new SignJWT({ email: opts.email })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
    .setSubject(opts.sub)
    .setAudience(opts.audience ?? 'authenticated')
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(key);
}
