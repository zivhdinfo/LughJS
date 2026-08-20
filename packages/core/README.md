# @lughjs/core

**A structured HTTP framework for Node.js.** Controllers, services, models,
migrations and a dependency container, with every expensive step resolved before
the first request arrives.

[![npm](https://img.shields.io/npm/v/@lughjs/core.svg)](https://www.npmjs.com/package/@lughjs/core)
[![node](https://img.shields.io/node/v/@lughjs/core.svg)](#requirements)
[![license](https://img.shields.io/npm/l/@lughjs/core.svg)](./LICENSE)

```bash
npx @lughjs/core new my-app
cd my-app && npm install
npm run migrate && npm run dev
```

Your app is on `http://127.0.0.1:3000`. Full documentation lives in the
[repository](https://github.com/zivhdinfo/LughJS).

## Contents

- [Why](#why)
- [Creating a project](#creating-a-project)
- [What a project looks like](#what-a-project-looks-like)
- [Routing](#routing)
- [Controllers and services](#controllers-and-services)
- [Models and migrations](#models-and-migrations)
- [Configuration](#configuration)
- [Errors and security](#errors-and-security)
- [Graceful shutdown](#graceful-shutdown)
- [CLI](#cli)
- [API](#api)
- [Requirements](#requirements)

## Why

Most projects start as one file and end as a directory nobody can navigate. Lugh
gives you the shape up front and then gets out of the way.

Three rules explain most of the design.

**Do it at boot, or do not do it.** Config is read, the pool is opened, services
are constructed, schemas are compiled and controller methods are bound while the
process starts. A route declared as `'PostController.index'` is a string in your
source and a bound function in the running server; the container is never
consulted per request.

**Names carry the wiring.** A file called `post_service.ts` registers as
`postService`, and a controller whose constructor takes a parameter of that name
receives it. No decorators, no metadata, no reflection, which is also why a
JavaScript project uses the container exactly as a TypeScript one does.

**A mistake should stop the boot, not the request.** A missing environment
variable, two files claiming one container key, a route pointing at a controller
that is not there, a schema that does not compile: all of these fail while you
are looking at the terminal, not at 3am in a log.

## Creating a project

`lugh new` asks five questions and writes a project that runs immediately.

```bash
npx @lughjs/core new my-app
```

| Question | Choices | Default |
|---|---|---|
| Project name | any valid package name | `my-app` |
| Language | `ts`, `js` | `ts` |
| Database | `sqlite`, `postgres`, `mysql` | `sqlite` |
| Auth scaffold | yes, no | no |
| AI assistant instructions | `none`, `claude`, `agents`, `both` | `none` |

Answer them as flags to skip the prompts entirely:

```bash
lugh new shop --language=ts --database=postgres --auth --ai=both --yes
```

`--ai` writes `AGENTS.md`, or `CLAUDE.md` with a `.claude/` directory of project
skills, or both. The content follows your other answers: a JavaScript project is
not told to write `static override tableName`, and the migration skill describes
the database you chose.

The auth scaffold adds a `users` table, bcrypt hashing at cost 12, JWT signing
with an expiry, helmet, CORS with an explicit origin list, rate limiting, and a
per-route `auth` guard. `JWT_SECRET` is generated into `.env` and declared with
no default, so the app refuses to boot without one.

## What a project looks like

```
my-app
├── app
│   ├── controllers   HTTP entry points, given the request and reply directly
│   ├── services      business logic, injected into controllers by parameter name
│   ├── models        Objection models
│   └── middleware    global hooks, auto-registered at boot in file-name order
├── config
│   ├── env.ts        environment specs, validated at boot
│   ├── app.ts        app name, logger, low-level server options
│   └── database.ts   Knex config, any dialect
├── database
│   ├── migrations    up() / down()
│   └── seeders       seed()
└── start
    ├── routes.ts     the route table
    └── server.ts     entry point
```

Only those four folders are conventional. Anything else you add is ordinary code
the framework never scans.

## Routing

```ts
// start/routes.ts
import { Route } from '@lughjs/core'
import { auth } from '../app/middleware/auth.js'

export default function routes() {
  Route.get('/health', async () => ({ status: 'ok' }))

  Route.group('/api', () => {
    Route.get('/posts', 'PostController.index')
    Route.get('/posts/:id', 'PostController.show')
    Route.post('/posts', 'PostController.store').middleware(auth).schema(postSchema)

    Route.resource('/tags', 'TagController')          // the five REST routes
  })
}
```

The table lives inside a function on purpose. A module body is evaluated once
per process, so top-level `Route` calls would register on the first boot and
silently vanish on the second, in a test, a benchmark or after a reload.

`.schema()` takes a JSON Schema. `body`, `params`, `querystring` and `headers`
validate what comes in; `response` shapes what goes out, and doing so both puts
serialization on the fast path and turns the schema into an allow-list. A
property you did not list cannot appear in the response, whatever the handler
returns.

## Controllers and services

```ts
// app/services/post_service.ts
import Post from '../models/post.js'

export default class PostService {
  all() {
    return Post.query().orderBy('id', 'desc')
  }
}
```

```ts
// app/controllers/post_controller.ts
import type { LughRequest, LughReply } from '@lughjs/core'
import PostService from '../services/post_service.js'

export default class PostController {
  // The parameter NAME is what the container matches on.
  constructor(private readonly postService: PostService) {}

  async index(request: LughRequest, reply: LughReply) {
    return this.postService.all()
  }
}
```

`db`, `config` and `env` are registered for you, so any constructor parameter
with one of those names receives it. Services and controllers are singletons,
built once while the app boots.

## Models and migrations

```ts
// app/models/post.ts
import { BaseModel } from '@lughjs/core'

export default class Post extends BaseModel {
  static tableName = 'posts'
}
```

```ts
// database/migrations/20250101000001_create_posts.ts
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('posts', (table) => {
    table.increments('id')
    table.string('title', 255).notNullable()
    table.text('body').notNullable()
    table.timestamps(true, true)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('posts')
}
```

Persistence is [Knex](https://knexjs.org) for the query builder and migrations,
and [Objection](https://vincit.github.io/objection.js/) for models and
relations. Both are ordinary dependencies, and nothing is wrapped, so their
documentation applies as written.

`migration:fresh` is worth knowing about: it drops every table in the schema and
re-runs everything, where `refresh` only replays each migration's `down()`. A
table a `down()` forgot, or one created by hand, survives `refresh` and does not
survive `fresh`.

## Configuration

```ts
// config/env.ts
import { str, num, bool } from 'envalid'

export default {
  NODE_ENV: str({ default: 'development', choices: ['development', 'test', 'production'] }),
  PORT: num({ default: 3000 }),
  LOGGER: bool({ default: true }),
  JWT_SECRET: str(),        // no default, so a missing value stops the boot
}
```

This is the contract. The boot fails with every offending name at once when a
variable is missing or malformed, which is what you want a bad deploy to do.

`config/app.ts` carries the app name, the logger setting and `server`, which is
forwarded to the HTTP layer for options such as `trustProxy` and `bodyLimit`.
`config/database.ts` is a Knex config for any dialect Knex supports.

## Errors and security

One error shape for the whole application:

- a failed schema becomes a 400 with the offending fields in `errors[]`
- an error carrying a 4xx `statusCode` keeps its status and its message, because
  a deliberate 4xx exists in order to be read
- anything else becomes a 500 with a generic message

The 500 rule is not caution for its own sake. Database drivers put the failing
statement, including the values bound into it, in `err.message`. Forwarding that
would answer an anonymous request with your table names, your column names, your
constraints and a row of real data. So `message` is `Internal Server Error` in
every environment, the detail is attached separately only outside production,
and the real error always goes to the log.

See [docs/security.md](https://github.com/zivhdinfo/LughJS/blob/main/docs/security.md)
for the full picture, including what the framework deliberately leaves to you.

## Graceful shutdown

```ts
// start/server.ts
import { createApp, installShutdownHandlers } from '@lughjs/core'

const { server, db, env } = await createApp(process.cwd())

installShutdownHandlers(server, db, { logger: (msg) => server.log.info(msg) })

await server.listen({ host: String(env.HOST), port: Number(env.PORT) })
```

On `SIGTERM` the server stops accepting connections, lets in-flight requests
finish, then closes the pool. The whole sequence has a budget, 10 seconds by
default, and the process exits `0` only if every phase finished inside it, so an
orchestrator can tell a graceful stop from an abandoned one.

## CLI

```bash
lugh new [name]                 # scaffold a project

lugh make:controller Post       # app/controllers/post_controller.ts
lugh make:model Post            # app/models/post.ts
lugh make:service Post          # app/services/post_service.ts
lugh make:migration create_posts
lugh make:seeder posts

lugh migration:run              # run pending migrations
lugh migration:rollback [--all]
lugh migration:refresh          # replay down() then up()
lugh migration:fresh            # DROP every table, then up()
lugh migration:status
lugh db:seed [--class name]

lugh list:routes                # the table the server actually installed
lugh dev                        # watch and reload
lugh serve
```

Set `LUGH_DEBUG=1` to print a stack trace when a command fails.

## API

Everything an application touches is exported from `@lughjs/core`.

| Export | Purpose |
|---|---|
| `createApp(root)` | Boots an application from a project root |
| `Route` | The route registrar imported by `start/routes` |
| `BaseModel` | Base class for models, bound to the app's connection |
| `installShutdownHandlers(server, db, opts?)` | SIGINT/SIGTERM handling |
| `gracefulShutdown(server, db, opts?)` | The drain sequence on its own |
| `installErrorHandler(server, env)` | The shared error shape |
| `runMigrations`, `rollbackMigrations`, `refreshMigrations`, `freshMigrations`, `resetMigrations`, `migrationStatus`, `runSeeders` | The migration API the CLI uses |
| `createDatabase(config)`, `listTables(db)`, `dropAllTables(db)` | Connection helpers |
| `buildContainer(deps)`, `registerFolder(container, dir)`, `toCamelCase(name)` | The container |
| `loadEnv(root, specs)` | Environment validation |

Types: `LughRequest`, `LughReply`, `LughServer`, `LughSchema`,
`LughServerOptions`, `Handler`, `Middleware`, `ServerPlugin`, `LughApp`,
`AppConfig`.

## Requirements

Node.js 22 or newer.

The package ships compiled JavaScript with type declarations, so importing it
costs no transpile and plain `node` can load it. The `lugh` CLI registers a
TypeScript loader before importing anything from your project, so a TypeScript
project still runs with no build step of its own.

## Documentation

- [Getting started](https://github.com/zivhdinfo/LughJS/blob/main/docs/getting-started.md)
- [Project structure](https://github.com/zivhdinfo/LughJS/blob/main/docs/project-structure.md)
- [Routing](https://github.com/zivhdinfo/LughJS/blob/main/docs/routing.md)
- [Controllers, services and DI](https://github.com/zivhdinfo/LughJS/blob/main/docs/controllers-and-di.md)
- [Database](https://github.com/zivhdinfo/LughJS/blob/main/docs/database.md)
- [Configuration](https://github.com/zivhdinfo/LughJS/blob/main/docs/configuration.md)
- [Security](https://github.com/zivhdinfo/LughJS/blob/main/docs/security.md)
- [Deployment](https://github.com/zivhdinfo/LughJS/blob/main/docs/deployment.md)
- [CLI reference](https://github.com/zivhdinfo/LughJS/blob/main/docs/cli.md)
- [Design notes](https://github.com/zivhdinfo/LughJS/blob/main/docs/design-notes.md)

## License

[MIT](./LICENSE)
