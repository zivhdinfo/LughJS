# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 2.x | yes |
| < 2.0 | no |

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub's
[security advisory form](https://github.com/zivhdinfo/LughJS/security/advisories/new).
If that is not available to you, email the maintainers listed in
[package.json](package.json).

Include, as far as you can:

- the affected version and the platform you ran it on
- a minimal project or route that reproduces the issue
- what an attacker gains, and what access they need to start

You can expect an acknowledgement within 5 working days and an assessment within
10. A confirmed report gets a fix on a private branch, a release, and a published
advisory that credits you unless you ask otherwise.

## Scope

In scope:

- the framework and CLI in `packages/core`
- the code written by `lugh new`, including the auth scaffold
- anything in `docs/` that recommends an insecure pattern

Out of scope:

- vulnerabilities in dependencies with no exploitable path through Lugh. Report
  those upstream; tell us if Lugh's use of them makes the impact worse.
- the reference application in `apps/demo` and the harness in `bench/`. Both are
  illustrative and neither is published. Issues there are ordinary bugs.
- findings that require an attacker to already control the project's source,
  `.env`, or the machine.

## What the framework guarantees

These are the properties a report can be written against. They are described in
full in [docs/security.md](docs/security.md) and covered by
`packages/core/test/hardening.test.ts`.

- A 5xx response never carries the internal error message, in any environment.
  Driver errors embed the failing SQL together with its bound values, so
  `message` is always generic and the detail is logged server-side.
- A route with a `response` schema emits only the listed properties. A column
  such as `password_hash` cannot be serialized even if a query selects it.
- A missing or malformed environment variable stops the boot rather than
  producing a running server with a placeholder secret.
- The auth scaffold never writes a fallback `JWT_SECRET`.

## What is left to the application

Authorization, token revocation, per-account brute-force limits, secret
management and CSRF are application concerns. `docs/security.md` explains why,
and what to do about each.
