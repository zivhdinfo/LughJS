# CLI reference

The binary is `lugh`. Every command except `new` runs from a project root.

```bash
lugh --help
lugh --version
```

Set `LUGH_DEBUG=1` to get a stack trace instead of just a message when a command
fails. Failures exit non-zero.

## `lugh new [name]`

Scaffolds a project. Prompts for anything not passed as a flag.

```bash
lugh new                                          # fully interactive
lugh new shop --language=ts --database=postgres --auth
lugh new api --language=js --database=mysql --no-auth
lugh new demo --yes                               # defaults, no prompts
```

| flag | values | default |
|---|---|---|
| `-l, --language` | `ts`, `js` | `ts` |
| `-d, --database` | `sqlite`, `postgres`, `mysql` | `sqlite` |
| `--auth` / `--no-auth` | — | no auth |
| `-y, --yes` | — | prompt |

Refuses to write into a non-empty directory. Generates a random `JWT_SECRET`
into `.env` when `--auth` is used.

## Generators

The output language follows the project, detected from whether `config/app.ts`
or `config/app.js` exists. Existing files are never overwritten — the command
reports `SKIP` instead.

| command | writes |
|---|---|
| `lugh make:controller <name>` | `app/controllers/<name>_controller.{ts,js}` |
| `lugh make:model <name>` | `app/models/<name>.{ts,js}` (pluralised `tableName`) |
| `lugh make:service <name>` | `app/services/<name>_service.{ts,js}` |
| `lugh make:migration <name>` | `database/migrations/<timestamp>_<name>.{ts,js}` |
| `lugh make:seeder <name>` | `database/seeders/<timestamp>_<name>.{ts,js}` |

```bash
lugh make:controller BlogPost      # app/controllers/blog_post_controller.ts
lugh make:model BlogPost           # tableName = 'blog_posts'
lugh make:migration create_posts   # table 'posts'
```

A name that cannot form a valid class (`2fa`, `---`) is rejected.

## Migrations

| command | what it does |
|---|---|
| `lugh migration:run` | run everything pending |
| `lugh migration:rollback` | undo the last batch |
| `lugh migration:rollback --all` | undo every batch |
| `lugh migration:refresh` | roll back all, then re-run |
| `lugh migration:reset` | roll back all, do not re-run |
| `lugh migration:fresh` | drop **every table in the schema**, then re-run |
| `lugh migration:status` | list each migration as completed or pending |

```
$ lugh migration:status

migration:status
  ✓ 20250101000000000_create_users.ts  (batch 1, 2026-08-20 00:01:12)
  · 20250210120000000_add_tags.ts  (pending)
```

`migration:fresh` is destructive on purpose — see [database.md](database.md) for
how it differs from `refresh`.

## Seeders

```bash
lugh db:seed
lugh db:seed --class 0001_seed_posts
lugh db:seed -c seed_posts            # partial name, must be unambiguous
```

An ambiguous partial name fails and lists the candidates rather than running one
of them.

## Running the server

```bash
lugh dev       # watch + reload
lugh serve     # no watch
lugh dev ./start/other-entry.ts
```

Both run the entry as a child process and forward `SIGINT`/`SIGTERM`, so the
app's graceful-shutdown handlers get a chance to drain. The entry is found at
`start/server.ts`, `start/server.js`, `src/server.ts`, `server.ts` or
`server.js`.

The exit status is the child's, or `128 + signal` when it was terminated by one.

## Inspecting routes

```bash
lugh list:routes
```

Boots the app and prints the routing tree that will actually serve traffic,
then closes the server and the database pool.

```
└── (empty root node)
    ├── /
    │   ├── health (GET, HEAD)
    │   └── api/
    │       ├── auth/
    │       │   ├── register (POST)
    │       │   └── login (POST)
    │       └── posts (GET, HEAD, POST)
    └── * (OPTIONS)
```

## Programmatic use

The CLI is a thin wrapper. Everything is importable:

```ts
import { createApp, runMigrations, gracefulShutdown } from '@lughjs/core'

const { app, db } = await createApp(process.cwd())
await runMigrations(db, './database/migrations')
await app.listen({ port: 3000 })
```
