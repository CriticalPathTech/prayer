# GoTrue JWT Dev-Only Fixtures

**DEV-ONLY — DO NOT USE IN PRODUCTION**

These files contain the RS256 RSA keypair used by the local Docker dev stack's GoTrue container.
They exist solely to enable a consistent, hermetic local development environment and are intentionally
committed to the repository. They have no value outside of local dev.

## Files

- `private.jwk.json` — RSA-2048 private key in JWK format. Loaded by GoTrue via `GOTRUE_JWT_KEYS`.
  GoTrue uses this to sign JWTs issued to users at signup/login.
- `jwks.json` — The corresponding public JWKS document. This is what `jose`'s `createRemoteJWKSet`
  reads from `http://gotrue:9999/.well-known/jwks.json`. GoTrue derives and serves this automatically
  from the private key — the copy here is for reference only.

## How keys were generated

```js
import { generateKeyPair, exportJWK } from 'jose';
const { publicKey, privateKey } = await generateKeyPair('RS256', {
  modulusLength: 2048,
  extractable: true,
});
```

Run from `apps/api/` where `jose` is installed.

## Rotating keys

1. Re-run the generation snippet above.
2. Replace both files.
3. Re-mint the `VITE_AUTH_ANON_KEY` and `AUTH_ADMIN_KEY` JWTs in `docker-compose.yml`
   by signing them with the new private key.
4. `docker compose down -v && docker compose up -d` — the old DB tokens are gone with the volume,
   so all sessions reset cleanly.
