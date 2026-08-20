<h1 align="center">Lugh</h1>

<p align="center">
  <strong>A structured HTTP framework for Node.js.</strong><br>
  Controllers, services, models, migrations and a dependency container,
  with every expensive step resolved before the first request arrives.
</p>

<p align="center">
  <a href="https://github.com/zivhdinfo/LughJS/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/zivhdinfo/LughJS/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/@lughjs/core"><img alt="npm" src="https://img.shields.io/npm/v/@lughjs/core.svg"></a>
  <a href="#license"><img alt="license" src="https://img.shields.io/npm/l/@lughjs/core.svg"></a>
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

`lugh new` asks four questions: project name, language (TypeScript or
JavaScript), database (SQLite, PostgreSQL or MySQL), and whether to include the
auth scaffold. Answer them as flags to skip the prompts:

```bash
lugh new shop --language=ts --database=postgres --auth --yes
```

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

## Quick example

```ts
// start/routes.ts
import { Route } from '@lughjs/core'
import { auth } from '../app/middleware/auth.js'

export default function routes() {
  Route.get('/health', async () => ({ status: 'ok' }))

  Route.group('/api', () => {
    Route.get('/posts', 'PostController.index')
    Route.post('/posts', 'PostController.store').middleware(auth).schema(postSchema)
  })
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
}
```

`'PostController.index'` is a string in your source and a bound function in the
running server. The container is consulted while booting, never per request.

## Documentation

| Guide | Contents |
|---|---|
| [Getting started](docs/getting-started.md) | Install, scaffold, first request |
| [Project structure](docs/project-structure.md) | Every folder, and the boot sequence |
| [Routing](docs/routing.md) | The route table, groups, schemas, guards |
| [Controllers, services and DI](docs/controllers-and-di.md) | How injection resolves |
| [Database](docs/database.md) | Models, migrations, seeders, relations |
| [Configuration](docs/configuration.md) | `config/*`, `.env`, validation at boot |
| [Security](docs/security.md) | Auth, error handling, and what is left to you |
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

## Design in three rules

**Do it at boot, or do not do it.** A route declared as `'PostController.index'`
is resolved once. A schema is compiled once, not interpreted per body. If
something can be settled before traffic arrives, it is.

**Names carry the wiring.** A file name becomes a container key, and a
constructor parameter name requests it. That is also why a JavaScript project
uses the container exactly as a TypeScript one does.

**A mistake should stop the boot, not the request.** A missing environment
variable, two files claiming one container key, a route pointing at a controller
that is not there, a schema that does not compile: all of these fail while you
are looking at the terminal.

More in [docs/design-notes.md](docs/design-notes.md).

## Benchmarks

`npm run bench` measures a real application, booted through `createApp`, with
the container, the controllers and the database in the path, and writes
[bench/BENCHMARKS.md](bench/BENCHMARKS.md).

The harness is built to be distrusted. Every endpoint is verified for status,
content type and body before it is timed; the median of five rounds is reported
rather than the best one; every sample is printed; and a single non-2xx response
fails the whole run, because an error is cheaper to produce than real work.

See [docs/testing-and-measurements.md](docs/testing-and-measurements.md).

## Repository layout

```
packages/core   @lughjs/core, the framework and the CLI
apps/demo       a reference application (posts, users, JWT auth)
bench           the measurement harness
docs            documentation
```

## Requirements

Node.js 22 or newer.

## Contributing

Bug reports and pull requests are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the local setup and the checks CI runs.

## Security

To report a vulnerability, please follow [SECURITY.md](SECURITY.md) rather than
opening a public issue.

## License

[MIT](LICENSE)
