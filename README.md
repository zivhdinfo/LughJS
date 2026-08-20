# Lugh

**Structure for Node HTTP services — without the runtime tax.**

Most projects start as one file and end as a directory nobody can navigate.
Lugh gives you the shape up front — controllers, services, models, migrations,
a container, a route table — and then gets out of the way. Every expensive
thing happens once, while the process boots: config is read, the pool is
opened, services are constructed, schemas are compiled, controller methods are
bound. By the time a request arrives there is nothing left to resolve.

```bash
npx @lughjs/core new my-app
cd my-app && npm install
npm run migrate && npm run dev
```

`lugh new` asks four questions — **project name**, **language** (TypeScript or
JavaScript), **database** (SQLite, PostgreSQL, MySQL) and whether to include the
**auth scaffold** — then writes a project that runs immediately. Answer them as
flags to skip the prompts:

```bash
lugh new shop --language=ts --database=postgres --auth
```

## The idea

Three rules explain most of the design.

**Do it at boot, or don't do it.** A route declared as `'PostController.index'`
is a string in your source and a bound function in the running server; the
container is never consulted per request. A schema is compiled once, not
interpreted per body. If something can be settled before traffic arrives, it is.

**Names carry the wiring.** A file called `post_service.ts` registers as
`postService`, and a controller that writes `constructor(private readonly
postService: PostService)` gets it. No decorators, no metadata, no imports to
keep in sync — which is also why a JavaScript project uses the container exactly
as a TypeScript one does.

**A mistake should stop the boot, not the request.** A missing environment
variable, two files claiming one container key, a route pointing at a controller
that isn't there, a schema that doesn't compile — all of these fail while you
are looking at the terminal, not at 3am in a log.

## Documentation

| | |
|---|---|
| [Getting started](docs/getting-started.md) | Install, scaffold, first request |
| [Project structure](docs/project-structure.md) | Each folder, and the boot sequence |
| [Routing](docs/routing.md) | The route table, groups, schemas, guards |
| [Controllers, services & DI](docs/controllers-and-di.md) | How injection resolves |
| [Database](docs/database.md) | Models, migrations, seeders, relations |
| [Configuration](docs/configuration.md) | `config/*`, `.env`, validation at boot |
| [Security](docs/security.md) | Auth, error handling, and what is left to you |
| [CLI reference](docs/cli.md) | Every command |
| [Design notes](docs/design-notes.md) | Why it works this way |
| [Testing & measurements](docs/testing-and-measurements.md) | The suite, and what the numbers say |

## What you get

- **A layout that survives growth** — `app/controllers`, `app/models`,
  `app/services`, `app/middleware`, `config/`, `database/`, `start/routes`
- **Migrations that mean it** — up/down, seeders, status, and a `migration:fresh`
  that genuinely drops the schema instead of replaying `down()`
- **A container with no per-request cost** — everything is a singleton resolved
  while booting
- **Schemas that validate and serialize** — declare `response` and the schema
  becomes an allow-list: a field you did not list cannot leave the process
- **Configuration that fails loudly** — a bad `.env` stops the boot and names
  every variable that is wrong
- **TypeScript or JavaScript** — the same framework, the same generators, no
  build step in either

## Measurements

`npm run bench` measures a real application — booted through `createApp`, with
the container, the controllers and the database in the path — and writes
[bench/BENCHMARKS.md](bench/BENCHMARKS.md).

The harness is built to be distrusted: every endpoint is verified for status,
content type and body before it is timed, the median of five rounds is reported
rather than the best one, every sample is printed, and **a single non-2xx
response fails the whole run** — because an error is cheaper to produce than
real work, so a broken server would otherwise post better numbers than a working
one.

See [docs/testing-and-measurements.md](docs/testing-and-measurements.md).

## Repository layout

```
packages/core   @lughjs/core — the framework and the CLI
apps/demo       a reference application (posts, users, JWT auth)
bench           the measurement harness
docs            documentation
```

## Requirements

Node.js 22 or newer.

## License

MIT
