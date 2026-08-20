# Changelog

## [2.0.0]

The first release under the Lugh name. Versioning starts here. The package is
`@lughjs/core` and the CLI is `lugh`.

This release came out of a full audit of the codebase. Everything below is
either a capability that did not exist or a defect that did, and each fix that
could be pinned down has a regression test that fails against the old code.

### Added

**`lugh new` — a project scaffolder.** Four questions, asked interactively or
passed as flags: **project name**, **language** (TypeScript or JavaScript),
**database** (SQLite, PostgreSQL, MySQL) and whether to include the **auth
scaffold**. It writes a project that migrates, seeds and serves immediately,
generates a real random `JWT_SECRET` into `.env`, and refuses to write into a
directory that already has files in it.

**JavaScript projects, properly.** Every generator emits JavaScript when the
project is JavaScript, and `createApp` resolves `config/*` and `start/routes` as
`.ts`, `.js` or `.mjs`. A `--language=js` project contains no TypeScript
anywhere and needs no build step.

**A Lugh-named HTTP surface.** `LughRequest`, `LughReply`, `LughServer`,
`LughSchema`, `Handler`, `Middleware` — application code imports from
`@lughjs/core` and nothing else.

**`Route.group(prefix, fn)`.** Nesting route groups; the previous prefix is
restored afterwards even if the callback throws.

**`migration:fresh` actually drops the schema.** It enumerates the tables and
drops them, per database engine, then re-runs the migrations. It used to be an
alias for `migration:refresh`, which meant it could not recover a database whose
real shape had drifted from its migration history — the one situation it exists
for. `listTables()` and `dropAllTables()` are exported.

**`config.server`** — low-level server options, which is where `trustProxy`
goes.

**`docs/`** — usage documentation covering the layout, routing, the container,
the database layer, configuration, security, the CLI, the design decisions, and
the test and measurement method.

### Fixed — security

- **A 5xx no longer echoes the internal error message.** `message` is
  `Internal Server Error` in every environment; detail moved to separate
  `error` and `stack` fields, attached only outside production. Database drivers
  put the failing statement *and its bound values* in the error message, so the
  previous behaviour answered anonymous requests with schema names and stored
  data.
- **`password_hash` cannot reach a client.** Routes returning user records
  declare a `response` schema — an allow-list enforced by the serializer — and
  the services project explicit columns so the hash is never fetched at all.
- **`JWT_SECRET` has no default.** A missing secret stops the boot instead of
  falling back to a shared literal. `.env` is no longer committed.
- **Tokens expire** (`JWT_EXPIRES_IN`, default `1h`) and carry only `sub`.
- **The auth guard returns its reply**, so the request stops instead of running
  the guarded handler against a reply that has already been sent.
- **No mass assignment.** Services read named fields, and a post's author comes
  from the verified token rather than the request body.
- **CORS uses an explicit origin list** instead of reflecting whatever the
  caller sent.
- **Login does not reveal which addresses are registered** — a dummy comparison
  keeps the timing and the message identical for an unknown email.
- Password hashing cost raised from 10 to 12.

### Fixed — correctness

- **`start/routes` must default-export a function.** The old module unwrapped
  the default export twice, so the documented callback form was never invoked at
  all, and the top-level form only worked on the first boot in a process. The
  cache-busting import that propped this up is gone, along with the unbounded
  module-map growth and the same-millisecond collision it caused.
- **Concurrent `createApp` calls no longer interleave** their route tables.
- **Container keys handle acronyms**, so `APIController` and `api_controller.ts`
  resolve to one key. A collision, or a file shadowing `db`/`config`/`env`, is a
  boot error rather than a silent overwrite.
- **`registerFolder` requires a default export** instead of picking an arbitrary
  named export by object-key order, and reads files in sorted order.
- **The migration-name parser no longer mangles table names.** Only a leading
  verb and a trailing `_table` are stripped, so `create_addresses` yields
  `addresses` and not `resses`.
- **Migration timestamps carry milliseconds**, so two files created in the same
  second still order deterministically.
- **`pluralize` does not double-pluralise** — `posts` stays `posts`.
- **Generated names are validated**, and model `tableName` is pluralised and
  carries `override`.
- **`migrationStatus` uses the configured migrations table**, tolerates it not
  existing yet, and handles both shapes the migrator reports pending entries in.
- **`MigrationResult` is the tuple actually returned**, `[batch, names]`.
- **Shutdown is bounded end to end.** The drain phase has a deadline, the
  deadline timer no longer keeps the loop alive, a timeout exits non-zero, and a
  second signal exits immediately.
- **`loadEnv` returns a plain object**, so reading an undeclared key gives
  `undefined` instead of throwing. `NODE_ENV` is always validated.
- **`db:seed --class` refuses an ambiguous partial match** instead of running
  whichever file the directory listing returned first.
- **`serve` and `dev` forward `SIGINT`/`SIGTERM`** to the child, so shutdown
  handlers run and nothing is orphaned. The exit status reflects the signal.
- **`list:routes` closes the database pool.**
- **The CLI exits non-zero on failure**, and prints a stack with `LUGH_DEBUG=1`.
- The duplicated `toCamelCase` implementation is gone; there is one.

### Fixed — the measurement harness

The previous harness could not support the numbers it published.

- **A reachable rate limit meant the measured responses were rejections.** An
  error is cheaper to produce than real work, so throughput rose while the
  server did nothing useful. The ceiling is now out of reach, and **a single
  non-2xx during a measured run fails the benchmark.**
- **Responses are verified** for status, content type and body before timing.
- **"Best of two" is replaced by the median of five**, and every sample is
  printed so the spread stays visible.
- **The load generator no longer shares a process with the server.**
- **A discarded warmup follows every boot.**
- **The before/after table for the hardened profile is measured in the same
  run.** It was previously rendered from a hardcoded array of numbers.
- **The `json` suite goes through a controller.** It was an inline function, so
  it measured the bare HTTP layer with the framework switched off.
- The memory gate that sampled the *harness* process is gone rather than left in
  place measuring the wrong thing.

### Changed

- `logger` still defaults to `true`; the documentation now states what that
  costs instead of claiming there is no per-request overhead.
- `LughApp.app` is now `LughApp.server`.
- Applications declare their own dependencies rather than relying on workspace
  hoisting.
- Committed build output, coverage artefacts and a committed `.env` were removed
  from the repository.
- `app/middleware` has a stated contract: a default-exported function is global
  middleware, a module without one is left alone for per-route guards, and files
  load in sorted order — hence the `005_`/`010_`/`020_` prefixes.
