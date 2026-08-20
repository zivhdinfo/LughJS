# Routing

`start/routes.ts` default-exports a function that declares the route table.

```ts
import { Route } from '@lughjs/core'

export default function routes() {
  Route.get('/health', async () => ({ status: 'ok' }))
}
```

**Why a function.** ES modules evaluate once per process. Top-level
`Route.get(...)` calls therefore run only on the first import, so a second boot
in the same process — a test, a benchmark, a reload — would register nothing.
`createApp` throws if the file does not default-export a function.

## Methods

```ts
Route.get(url, handler)
Route.post(url, handler)
Route.put(url, handler)
Route.patch(url, handler)
Route.delete(url, handler)
Route.head(url, handler)
Route.options(url, handler)
```

`url` supports `:params` and wildcards.

## Handlers

A handler is either an inline function or a `'Controller.action'` string:

```ts
Route.get('/ping', async () => ({ pong: true }))
Route.get('/posts', 'PostController.index')
```

The string is resolved **once, at boot**: the container builds the controller,
the action is bound to it, and the server stores a plain function. Nothing about
the container is touched per request.

`'PostController.index'` is camel-cased to the container key `postController`,
which is the file `app/controllers/post_controller.ts`. If that key is not
registered, boot fails with a message naming the key it looked for.

## Groups

```ts
Route.group('/api', () => {
  Route.get('/posts', 'PostController.index')

  Route.group('/v2', () => {
    Route.get('/posts', 'PostV2Controller.index')   // /api/v2/posts
  })
})
```

Groups nest, and the prefix is restored afterwards even if the callback throws.

## Resources

```ts
Route.resource('/posts', 'PostController')
```

is shorthand for:

| method | url | action |
|---|---|---|
| GET | `/posts` | `index` |
| POST | `/posts` | `store` |
| GET | `/posts/:id` | `show` |
| PUT, PATCH | `/posts/:id` | `update` |
| DELETE | `/posts/:id` | `destroy` |

Narrow it with `only`:

```ts
Route.resource('/posts', 'PostController', { only: ['index', 'show'] })
```

## Schemas

`.schema()` takes a JSON Schema. It is compiled once, while the app boots — a
request never pays for parsing or interpreting it.

```ts
Route.post('/posts', 'PostController.store').schema({
  body: {
    type: 'object',
    required: ['title', 'body'],
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 255 },
      body: { type: 'string', minLength: 1 },
    },
  },
  response: {
    201: { $ref: 'post#' },
  },
})
```

A failing body produces a 400 with a consistent shape:

```json
{
  "message": "body must have required property 'body'",
  "errors": [{ "field": "", "message": "must have required property 'body'" }]
}
```

### Declare a `response` schema

It is worth doing for two separate reasons:

1. **Speed.** A declared response shape is compiled into a purpose-built
   serializer. Without one the reply falls back to generic stringification.
2. **Safety.** That serializer emits *only* the listed properties. A column such
   as `password_hash` cannot reach a client even if a query selects it — which
   is a guarantee no amount of care in the service layer gives you.

Register shared schemas from a middleware file so they exist before the routes
that reference them:

```ts
// app/middleware/010_schemas.ts
export default async function schemas(server: LughServer) {
  server.addSchema({
    $id: 'user',
    type: 'object',
    // password_hash is deliberately absent
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      email: { type: 'string' },
    },
  })
}
```

Then `$ref: 'user#'` from any route.

## Per-route middleware

`.middleware(...)` attaches guards that run before this route's handler, and
only this route's:

```ts
import { auth } from '../app/middleware/auth.js'

Route.post('/posts', 'PostController.store').middleware(auth).schema(postSchema)
```

A guard must **return** the reply it sends:

```ts
export async function auth(request: LughRequest, reply: LughReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ message: 'Unauthorized' })
  }
}
```

Without the `return`, the request carries on to the route handler and the
guarded code runs anyway, against a reply that has already been sent.

`.schema()` and `.middleware()` both return the builder, so they chain in any
order.

## Inspecting the table

```bash
lugh list:routes
```

boots the app and prints the routing table that will actually serve traffic.
