<h1 align="center">Lugh</h1>

<p align="center">
  <strong>A structured HTTP framework for Node.js.</strong><br>
  Controllers, services, models, migrations and a dependency container,
  with every expensive step resolved before the first request arrives.
</p>

<p align="center">
  <a href="https://github.com/zivhdinfo/LughJS/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/zivhdinfo/LughJS/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/@lughjs/core"><img alt="npm" src="https://img.shields.io/npm/v/@lughjs/core.svg"></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/npm/l/@lughjs/core.svg"></a>
  <a href="#requirements"><img alt="node" src="https://img.shields.io/node/v/@lughjs/core.svg"></a>
</p>

---

## Installation

```bash
npx @lughjs/core new my-app
cd my-app
npm install
npm run migrate
npm run dev
```

Your app is on `http://127.0.0.1:3000`.

`lugh new` asks five questions: project name, language (TypeScript or
JavaScript), database (SQLite, PostgreSQL or MySQL), whether to include the auth
scaffold, and whether to write instructions for AI coding assistants. Answer
them as flags to skip the prompts:

```bash
lugh new shop --language=ts --database=postgres --auth --ai=both --yes
```

`--ai` writes `AGENTS.md`, or `CLAUDE.md` with a `.claude/` directory of project
skills, or both. The content follows your other answers, and it covers the rules
this framework enforces at boot, which are the ones a model otherwise guesses
wrong. See [docs/cli.md](docs/cli.md#instructions-for-ai-assistants).

## Features

- **A layout that survives growth.** `app/controllers`, `app/services`,
  `app/models`, `app/middleware`, `config/`, `database/`, `start/routes`.
- **Dependency injection by name.** A file called `post_service.ts` registers as
  `postService`, and any constructor parameter with that name receives it. No
  decorators, no metadata, no reflection.
- **Zero per-request framework cost.** Config, the connection pool, services,
  schemas and controller bindings are all resolved once, at boot.
- **Migrations that mean it.** `up`/`down`, seeders, status, and a
  `migration:fresh` that truly drops the schema instead of replaying `down()`.
- **Schemas that validate and serialize.** Declare a `response` schema and it
  becomes an allow-list: a field you did not list cannot leave the process.
- **Configuration that fails loudly.** A bad `.env` stops the boot and names
  every variable that is wrong.
- **TypeScript or JavaScript.** The same framework and the same generators, with
  no build step required in either.
- **Graceful shutdown.** SIGTERM stops new connections, drains what is in
  flight, then closes the pool, with an exit code that reflects the outcome.

## A vertical slice

Five files, which is the whole framework in miniature.

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

```ts
// app/models/post.ts
import { BaseModel } from '@lughjs/core'

export default class Post extends BaseModel {
  static tableName = 'posts'
}
```

```ts
// app/services/post_service.ts
import Post from '../models/post.js'

export default class PostService {
  all() {
    return Post.query().orderBy('id', 'desc')
  }

  create(input: { title: string; body: string }) {
    // Only the columns a client may set are read off the input.
    return Post.query().insert({ title: input.title, body: input.body })
  }
}
```

```ts
// app/controllers/post_controller.ts
import type { LughRequest, LughReply } from '@lughjs/core'
import PostService from '../services/post_service.js'

export default class PostController {
  // Injected by parameter name: `postService` resolves post_service.ts
  constructor(private readonly postService: PostService) {}

  async index(request: LughRequest, reply: LughReply) {
    return this.postService.all()
  }

  async store(request: LughRequest, reply: LughReply) {
    const post = await this.postService.create(request.body as { title: string; body: string })
    reply.code(201)
    return post
  }
}
```

```ts
// start/routes.ts
import { Route } from '@lughjs/core'

const postSchema = {
  body: {
    type: 'object',
    required: ['title', 'body'],
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 255 },
      body: { type: 'string', minLength: 1 },
    },
  },
  response: { 200: { $ref: 'post#' }, 201: { $ref: 'post#' } },
}

export default function routes() {
  Route.get('/health', async () => ({ status: 'ok' }))

  Route.group('/api', () => {
    Route.get('/posts', 'PostController.index')
    Route.post('/posts', 'PostController.store').schema(postSchema)
  })
}
```

`'PostController.index'` is a string in your source and a bound function in the
running server. The container is consulted while booting, never per request.

Generate all of it with three commands:

```bash
lugh make:migration create_posts
lugh make:model Post
lugh make:service Post
lugh make:controller Post
```

## The idea

Three rules explain most of the design.

**Do it at boot, or do not do it.** A route declared as a controller string is
resolved once. A schema is compiled once, not interpreted per body. If something
can be settled before traffic arrives, it is.

**Names carry the wiring.** A file name becomes a container key, and a
constructor parameter name requests it. That is also why a JavaScript project
uses the container exactly as a TypeScript one does.

**A mistake should stop the boot, not the request.** A missing environment
variable, two files claiming one container key, a route pointing at a controller
that is not there, a schema that does not compile: all of these fail while you
are looking at the terminal.

More in [docs/design-notes.md](docs/design-notes.md).

## Documentation

Start at [docs/](docs/README.md), or jump straight in:

| Guide | Contents |
|---|---|
| [Getting started](docs/getting-started.md) | Install, scaffold, first request |
| [Project structure](docs/project-structure.md) | Every folder, and the boot sequence |
| [Routing](docs/routing.md) | The route table, groups, schemas, guards |
| [Controllers, services and DI](docs/controllers-and-di.md) | How injection resolves |
| [Database](docs/database.md) | Models, migrations, seeders, relations |
| [Configuration](docs/configuration.md) | `config/*`, `.env`, validation at boot |
| [Security](docs/security.md) | Auth, error handling, and what is left to you |
| [Deployment](docs/deployment.md) | Environment, containers, health checks, shutdown |
| [CLI reference](docs/cli.md) | Every command |
| [Design notes](docs/design-notes.md) | Why it works this way |
| [Testing and measurements](docs/testing-and-measurements.md) | The suite, and what the numbers say |

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

lugh list:routes
lugh dev                        # watch and reload
lugh serve
```

Full reference: [docs/cli.md](docs/cli.md).

## Benchmarks

`npm run bench` measures a real application, booted through `createApp`, with
the container, the controllers and the database in the path, and writes
[bench/BENCHMARKS.md](bench/BENCHMARKS.md).

The harness is built to be distrusted. Every endpoint is verified for status,
content type and body before it is timed; the median of five rounds is reported
rather than the best one; every sample is printed; and a single non-2xx response
fails the whole run, because an error is cheaper to produce than real work.

Read the numbers as a baseline for one machine, useful for catching a regression
between two runs, not as the throughput of a tuned deployment. Method and
caveats: [docs/testing-and-measurements.md](docs/testing-and-measurements.md).

## Testing

56 tests, run with `node:test` against real code: a real boot through
`createApp`, real SQLite migrations, a real child process for the shutdown test,
and a real `tsc` invocation proving the scaffolded project typechecks.

```bash
npm test
```

## Built on

Lugh is a structure around four libraries rather than a reimplementation of
them, and none of them is wrapped, so their documentation applies as written.

| | |
|---|---|
| [Fastify](https://fastify.dev) | HTTP, schema validation, fast serialization |
| [Knex](https://knexjs.org) | Query builder, migrations, seeders |
| [Objection](https://vincit.github.io/objection.js/) | Models and relations |
| [Awilix](https://github.com/jeffijoe/awilix) | The container |

## Repository layout

```
packages/core   @lughjs/core, the framework and the CLI
apps/demo       a reference application (posts, users, JWT auth)
bench           the measurement harness
docs            documentation
```

## Requirements

Node.js 22 or newer.

The package ships compiled JavaScript with type declarations, so importing it
costs no transpile and plain `node` can load it. The `lugh` CLI registers a
TypeScript loader before importing anything from your project, so a TypeScript
project still runs with no build step of its own.

## Contributing

Bug reports and pull requests are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the local setup and the checks CI runs,
and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for the ground rules.

## Security

To report a vulnerability, please follow [SECURITY.md](SECURITY.md) rather than
opening a public issue.

## License

[MIT](LICENSE)
