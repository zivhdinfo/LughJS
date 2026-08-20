# Project structure

```
my-app
├── app
│   ├── controllers   HTTP entry points, given the request and reply directly
│   ├── services      business logic; injected into controllers by parameter name
│   ├── models        Objection models (tableName, relationMappings)
│   └── middleware    global hooks, auto-registered at boot in file-name order
├── config
│   ├── env.ts        envalid specs, validated at boot, fails fast
│   ├── app.ts        app name, logger, low-level server options
│   └── database.ts   Knex config (any dialect)
├── database
│   ├── migrations    up() / down()
│   └── seeders       seed()
├── start
│   ├── routes.ts     the route table, a default-exported function
│   └── server.ts     entry point: createApp() → listen
└── .env              never committed; .env.example is the template
```

Only `config/`, `app/`, `start/` and `database/` are conventional. Anything else
you add is ordinary code that the framework never scans.

## Boot order

`createApp(root)` does exactly this, in order:

1. **`config/env`** is imported and its specs are validated against
   `process.env` (after `.env` is loaded). A missing or malformed variable
   throws here, before anything else exists.
2. **`config/app`** and **`config/database`** are imported.
3. **The Knex connection** is created and bound to Objection's `Model`.
4. **The DI container** is built, then `app/services` and `app/controllers` are
   scanned in sorted order and registered as singletons.
5. **The server** is created with `config.logger` and anything in
   `config.server`.
6. **`app/middleware/*`** is imported in sorted file-name order; every module
   with a default-exported function is invoked with the server.
7. **`start/routes`** is imported and its default-exported function is called;
   the collected routes are installed on the server.
8. The 404 handler and the error handler are installed.
9. The server is brought up and reports ready.

Steps 6 and 7 are in that order on purpose: middleware that calls
`server.addSchema()` must run before the routes that `$ref` those schemas.

Boots are serialised. `createApp` mutates a process-global route registrar, so
two concurrent calls would interleave their route tables; a second call waits
for the first to finish.

## File naming and container keys

A file name maps to a container key by camel-casing it:

| file | container key | constructor parameter |
|---|---|---|
| `post_service.ts` | `postService` | `constructor(private readonly postService: PostService)` |
| `post_controller.ts` | `postController` | referenced as `'PostController.index'` in routes |
| `api_controller.ts` | `apiController` | `'APIController.index'` also resolves to `apiController` |

Acronyms are handled: `APIController`, `HTTPClientService` and their snake_case
file names land on the same key. Two files that map to the same key are a boot
error, not a silent overwrite, and a file that maps to `db`, `config` or `env`
is rejected because those are the framework's own registrations.

Every file in `app/services` and `app/controllers` must **default-export a
class**. Subdirectories are not scanned.

## Middleware conventions

`app/middleware` holds two different things, told apart by whether the module
has a default export.

**A default-exported function is global middleware** and is invoked directly
with the server:

```ts
// app/middleware/020_request_logger.ts
export default async function requestLogger(server: LughServer) {
  server.addHook('onResponse', (request, reply, done) => {
    request.log.info({ url: request.url, status: reply.statusCode }, 'request')
    done()
  })
}
```

It is invoked directly, **not** through `server.register`. Registering it as a
plugin would scope its hooks to a child context, where they would never reach
your routes.

The exception is a module that wraps an ecosystem plugin. Those deliberately
publish their decorators onto the root instance, so `register` is correct
*inside* the function:

```ts
// app/middleware/005_security.ts
export default async function security(server: LughServer) {
  await server.register(helmet)
  await server.register(cors, { origin: [...] })
}
```

**A module with no default export is left alone.** That is the convention for
per-route guards, which `start/routes` imports and attaches explicitly:

```ts
// app/middleware/auth.ts, no default export
export async function auth(request: LughRequest, reply: LughReply) { … }
```

Files are loaded in sorted order, which is why the scaffolder writes
`005_security.ts`, `010_schemas.ts`, `020_request_logger.ts`. The numeric
prefix is the ordering mechanism.

## Repository layout (this monorepo)

```
packages/core   @lughjs/core, the framework and the CLI
apps/demo       reference app, a real consumer of the package
bench           the measurement harness
docs            this documentation
```
