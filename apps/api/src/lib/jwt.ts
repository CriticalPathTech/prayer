import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
} from 'jose';

export interface SupabaseJwtClaims extends JWTPayload {
  sub: string;
  email: string;
  aud: string | string[];
}

export interface JwtVerifier {
  verify(token: string): Promise<SupabaseJwtClaims>;
}

export interface CreateJwtVerifierOptions {
  audience?: string;
  issuer?: string;
}

export function createJwtVerifier(
  jwksUrl: string,
  options: CreateJwtVerifierOptions = {},
): JwtVerifier {
  const useLocalFile = jwksUrl.startsWith('file://');
  const jwks = useLocalFile
    ? createLocalJWKSet(loadLocalJwks(jwksUrl))
    : createRemoteJWKSet(new URL(jwksUrl));

  const verifyOptions = {
    audience: options.audience ?? 'authenticated',
    ...(options.issuer ? { issuer: options.issuer } : {}),
  };

  return {
    async verify(token: string): Promise<SupabaseJwtClaims> {
      const { payload } = await jwtVerify(token, jwks, verifyOptions);
      if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
        throw new Error('JWT missing required sub/email claims');
      }
      return payload as SupabaseJwtClaims;
    },
  };
}

function loadLocalJwks(jwksUrl: string): JSONWebKeySet {
  const filePath = fileURLToPath(new URL(jwksUrl));
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as JSONWebKeySet;
}
