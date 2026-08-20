# Security

What the framework guarantees, what the scaffold sets up, and what is left to
you.

## Error responses never leak internals

A 5xx always returns a generic message:

```json
{ "message": "Internal Server Error" }
```

This matters because driver and ORM errors embed the failing SQL **together with
its bound parameter values**. Forwarding `err.message` hands an unauthenticated
caller your table names, your column names, your constraint names and whatever
was in the row. Outside production the detail is still available, in separate
fields:

```json
{
  "message": "Internal Server Error",
  "error": "insert into `posts` … - FOREIGN KEY constraint failed",
  "stack": ["Error: …", "    at …"]
}
```

`message` is generic in *every* environment, so a client or a log shipper that
only reads `message` can never surface internals by accident. `NODE_ENV` decides
whether `error` and `stack` are attached; the real error is always logged
server-side at `error` level.

A deliberate 4xx keeps its message. That is the point of throwing one:

```ts
export class AuthError extends Error {
  constructor(message: string, readonly statusCode = 401) { super(message) }
}
throw new AuthError('Email already registered', 409)
```

Validation failures become a 400 with a consistent `errors[]` array.

## Response schemas as an allow-list

Declare a `response` schema and the fast serializer emits **only** the listed
properties. That is a structural guarantee, not a convention:

```ts
server.addSchema({
  $id: 'user',
  type: 'object',
  // password_hash is absent, so it cannot be serialized
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    email: { type: 'string' },
  },
})
```

A `SELECT *` that happens to include `password_hash` still cannot leak it
through a route that uses this schema. Belt and braces: also project the columns
you mean in the service, so the hash never enters process memory:

```ts
const PUBLIC_COLUMNS = ['users.id', 'users.name', 'users.email']
User.query().select(PUBLIC_COLUMNS)
```

## The auth scaffold

`lugh new --auth` generates:

- a `users` table with a unique `email` and a `password_hash`
- bcrypt hashing at **cost 12**
- JWT signing with an **expiry** (`JWT_EXPIRES_IN`, default `1h`)
- helmet, CORS with an explicit origin list, and rate limiting
- an `auth` guard, and guards on the routes that write

### Guards must return the reply

```ts
export async function auth(request: LughRequest, reply: LughReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ message: 'Unauthorized' })
  }
}
```

A guard that sends a reply **without returning it** does not stop the request:
the route handler still runs, against a reply that has already been sent. The
`return` is the whole mechanism.

### Login does not reveal which emails exist

The generated service compares against a dummy hash when the address is unknown,
so "no such user" and "wrong password" take the same time and return the same
message:

```ts
const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)
if (!user || !ok) throw new AuthError('Invalid credentials')
```

### Token claims stay minimal

`{ sub: user.id }` and nothing else. An email or a role baked into a token is
stale the moment it changes, and there is no revocation path for it.

## CORS

The scaffold writes an explicit list:

```ts
origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(',').map((s) => s.trim())
```

`origin: true` reflects whatever `Origin` the caller sent, which makes the header
decorative. Once credentials are involved it is actively harmful.

## Rate limiting behind a proxy

The rate limiter keys on the client IP. Behind a load balancer every request
appears to come from the proxy, so the limit becomes global and one client can
exhaust it for everyone. Set `trustProxy`:

```ts
// config/app.ts
export default { server: { trustProxy: true } }
```

Only turn it on when a proxy you control really is in front of the app,
otherwise a client can forge `X-Forwarded-For` and evade the limit instead.

## What the framework does not do for you

- **Authorization.** The guard proves *who* is calling. Whether they may touch
  *this row* is your check, in the service.
- **Token revocation.** JWTs expire; they are not revocable. If you need logout
  to take effect immediately, keep a denylist or use short-lived tokens with
  refresh.
- **Login brute-force protection.** The global rate limit applies, but a
  per-account attempt counter with backoff is application logic.
- **Secret management.** `.env` is fine for development. In production inject
  the environment from your platform's secret store.
- **CSRF.** Only relevant if you move from bearer tokens to cookies; then add
  a CSRF plugin.

## Checklist before going to production

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` injected from a secret store, not a file
- [ ] `CORS_ORIGIN` set to real origins
- [ ] `trustProxy` set if and only if a proxy is in front
- [ ] `logger` at a sensible level; the app logs the full error, so ship those logs
- [ ] `response` schemas on any route that returns user records
- [ ] `npm audit --omit=dev` clean
