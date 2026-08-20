# Demo application

A reference application built on Lugh. Not published, and not a template to
copy wholesale: `lugh new` is the template. This exists so that every pattern
the guides describe can be read in one working piece.

## Running it

From the repository root:

```bash
npm ci                                  # builds @lughjs/core through its prepare step
cd apps/demo
cp .env.example .env                    # then put a real JWT_SECRET in it
npm run migrate
npm run seed
npm run dev                             # http://127.0.0.1:3000
```

`JWT_SECRET` is declared in `config/env.ts` with no default, so the app refuses
to boot until you set one. Generate a value with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## What it demonstrates

| Pattern | Where |
|---|---|
| Injection by parameter name | [app/controllers/post_controller.ts](app/controllers/post_controller.ts) |
| Author taken from the token, never the body | [app/services/post_service.ts](app/services/post_service.ts) |
| Ownership checks scoped into the statement | [app/services/post_service.ts](app/services/post_service.ts) |
| Timing-safe login, and a public column list | [app/services/auth_service.ts](app/services/auth_service.ts) |
| Response schemas as an allow-list | [app/middleware/010_schemas.ts](app/middleware/010_schemas.ts) |
| Security plugins registered at the root | [app/middleware/005_security.ts](app/middleware/005_security.ts) |
| A per-route guard with no default export | [app/middleware/auth.ts](app/middleware/auth.ts) |
| Objection relations both ways | [app/models/post.ts](app/models/post.ts), [app/models/user.ts](app/models/user.ts) |
| Graceful shutdown wired up | [start/server.ts](start/server.ts) |

The two middleware naming rules are visible here rather than described: files
load in sorted order, which is why they are numbered `005_`, `010_`, `020_`, and
`auth.ts` has no default export, which is how the framework knows to leave it
alone for per-route use.

## Routes

```
GET    /health

POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me              auth

GET    /api/posts
GET    /api/posts/:id
POST   /api/posts                auth
PUT    /api/posts/:id            auth, owner only
PATCH  /api/posts/:id            auth, owner only
DELETE /api/posts/:id            auth, owner only

GET    /api/users
GET    /api/users/:id
GET    /api/users/:id/posts
```

`lugh list:routes` prints the table the server actually installed, which is the
one to trust.

## Trying it out

```bash
curl -X POST localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"name":"Ada","email":"ada@example.com","password":"correct horse"}'

TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"correct horse"}' | jq -r .token)

curl -X POST localhost:3000/api/posts \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"title":"Hello","body":"First post."}'
```

Two things worth trying deliberately, because they are the interesting part:

- Register a second user and try to `DELETE` the first user's post. You get a
  403, not a 404, and not a deletion. Authentication is not authorization, and
  the check lives in the service.
- Send `{"title":"x","body":"y","user_id":99}`. You get a 201, and the row comes
  back with your own id, not 99. `additionalProperties: false` makes the
  validator strip the property rather than reject the request, so the handler
  never sees it, and the author still comes from the token.

## What it is not

There is no pagination on the list endpoints, and no per-account login throttle.
Both are application concerns and both are called out in
[docs/security.md](../../docs/security.md). Do not read their absence here as a
recommendation.
