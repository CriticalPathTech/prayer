# Security Policy

## Reporting a vulnerability

**Please do not file public GitHub issues for security vulnerabilities.**

Use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the issue, the affected version, and reproduction steps.

We aim to acknowledge reports within 3 business days and to ship a fix or
mitigation within 30 days for confirmed issues. Coordinated disclosure
timelines are negotiable for severe issues.

## Supported versions

We support the latest tagged release on `main`. Older versions are
not patched — please upgrade.

## Scope

In scope:

- Authentication / authorization bypass in the API
- Cross-tenant data leakage
- SQL injection, XSS, CSRF
- Unauthenticated remote-code execution
- Privilege escalation across roles (`member` → `moderator` → `super_user`)
- Session/JWT handling flaws
- Secrets accidentally committed to the repository

Out of scope:

- Findings from automated scanners without a working proof-of-concept
- Denial-of-service via volumetric traffic (rate limits are documented as
  per-instance MemoryStore-backed; not a vulnerability)
- Issues requiring a compromised host or root access
- Self-XSS in user-controlled fields displayed only to the user themself
- Email enumeration via auth endpoints (Supabase-handled)

## Hardening notes for self-hosters

- Rotate the `GOTRUE_JWT_KEYS` keypair before going to production. The keys
  in `docker/gotrue-jwt/` are dev-only fixtures and should NEVER be used to
  sign production JWTs. See `docker/gotrue-jwt/README.md`.
- Set `RATE_LIMIT_ENABLED=true` in production.
- Use a real `CORS_ORIGIN` allowlist (not `*`).
- Run behind TLS — the API trusts `X-Forwarded-For` two hops deep, which is
  correct behind Railway-style proxies but assumes a trustworthy edge.
- Keep dependencies current; subscribe to GitHub Dependabot alerts for the
  fork.
