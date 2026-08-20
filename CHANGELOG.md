# Changelog

## [2.1.0]

### Added

**`--ai`, instructions for AI coding assistants.** A fifth question in
`lugh new`, with four answers: `none`, `claude`, `agents` or `both`.

- `agents` writes `AGENTS.md`, the portable convention several tools read.
- `claude` writes `CLAUDE.md`, a `.claude/settings.json` permission list, and
  `.claude/skills/` containing `lugh-resource`, `lugh-migrations` and, when the
  auth scaffold is present, `lugh-auth`.
- `both` writes all of it, with `CLAUDE.md` deferring to `AGENTS.md` rather than
  repeating it.

The content follows the project's other answers. A JavaScript project is not
told to write `static override tableName`, a project without the auth scaffold
gets no token instructions, and the migration skill describes the database that
was actually chosen, including the way that dialect behaves when a migration
fails part way. What goes in these files is only what an assistant cannot infer
from the code in front of it: the conventions the framework enforces at boot,
and the mistakes that look correct until the second boot or the first hostile
request.

`.claude/settings.json` pre-approves the routine commands and denies
`migration:fresh`, which drops every table in the schema.

### Fixed

- **`lugh new` asked nothing in terminals that do not report a TTY.** Prompting
  was gated on `process.stdin.isTTY`, which is false in Git Bash on Windows and
  in several wrapped terminals. The command silently produced a default project
  and never asked a question. Prompting is now attempted whenever `--yes` was
  not passed, and when stdin turns out to be empty the defaults are printed with
  the flags that set them, rather than applied in silence.
- **A prompt on an already-closed stdin hung forever.** `rl.question()` never
  settles on an ended stream, so the fallback above had to race the readline
  `close` event rather than wait on an answer that could not arrive.
- **A missing environment variable reported `EnvMissingError: undefined`.**
  envalid gives that error the literal message `"undefined"`, so the obvious
  `String(err)` rendered nothing useful. The boot failure now names each
  variable, says whether it was missing or invalid, and points at the `.env`
  that is not there:

  ```
  [lugh] Invalid environment variables:
    JWT_SECRET: missing, and config/env declares no default for it

  There is no .env in /srv/app. Copy .env.example to .env and fill it in, or
  inject these variables from the environment.
  ```

- **`npm publish` warned that `bin[lugh]` was cleaned.** npm normalises
  `./bin/lugh.js` to `bin/lugh.js`; the manifest now carries the normalised
  form.

### Documentation

- `docs/cli.md` covers `--ai`, what each value writes, and what happens when
  there is nobody to answer the questions.

## [2.0.0]

The first release under the Lugh name. Versioning starts here. The package is
`@lughjs/core` and the CLI is `lugh`.

This release came out of a full audit of the codebase. Everything below is
either a capability that did not exist or a defect that did, and each fix that
could be pinned down has a regression test that fails against the old code.

### Added

**`lugh new`, a project scaffolder.** Four questions, asked interactively or
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
`LughSchema`, `Handler`, `Middleware`. Application code imports from
`@lughjs/core` and nothing else.

**`Route.group(prefix, fn)`.** Nesting route groups; the previous prefix is
restored afterwards even if the callback throws.

**`migration:fresh` actually drops the schema.** It enumerates the tables and
drops them, per database engine, then re-runs the migrations. It used to be an
alias for `migration:refresh`, which meant it could not recover a database whose
real shape had drifted from its migration history, which is the one situation it exists
for. `listTables()` and `dropAllTables()` are exported.

**`config.server`**: low-level server options, which is where `trustProxy`
goes.

**`docs/`**: usage documentation covering the layout, routing, the container,
the database layer, configuration, security, the CLI, the design decisions, and
the test and measurement method.

### Fixed: distribution

- **The package is published as compiled JavaScript.** `main`, `types` and
  `exports` pointed at `src/index.ts`. Node refuses to strip types from anything
  under `node_modules`, so `import '@lughjs/core'` failed with
  `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` unless the importing process
  happened to have a TypeScript loader registered. The build already existed and
  was simply never referenced. The tarball ships `dist/` with declarations and
  standalone source maps; inside the repository the `lugh-dev` export condition
  resolves to `src/`, so the test suite still runs against the sources.
- **The CLI shim imports through the package exports** rather than a relative
  path, so it cannot hold a second copy of the module-global `Route` registrar
  while the project holds the first. That combination made `list:routes` report
  an empty table.
- **`lugh --version` reads `package.json`** instead of a literal that had to be
  kept in step by hand.

### Fixed: security

- **A 5xx no longer echoes the internal error message.** `message` is
  `Internal Server Error` in every environment; detail moved to separate
  `error` and `stack` fields, attached only outside production. Database drivers
  put the failing statement *and its bound values* in the error message, so the
  previous behaviour answered anonymous requests with schema names and stored
  data.
- **`password_hash` cannot reach a client.** Routes returning user records
  declare a `response` schema, an allow-list enforced by the serializer, and
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
- **Login does not reveal which addresses are registered**, using a dummy comparison
  keeps the timing and the message identical for an unknown email.
- Password hashing cost raised from 10 to 12.

- **Generated services do not mass-assign.** `lugh make:service` emitted
  `Model.query().insert(input)` under a comment warning against exactly that. It
  emits a `FILLABLE` allow-list and a `pick()` helper, and `create` and `update`
  both go through it.
- **The reference application checks ownership on writes.** `PUT`, `PATCH` and
  `DELETE` on `/api/posts/:id` were guarded by `auth` and nothing more, so any
  authenticated user could edit or delete any post. Both statements are scoped
  by `user_id`, which also closes the check-then-write race, and the controller
  distinguishes 404 from 403.

### Fixed: correctness

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
- **`pluralize` does not double-pluralise**, so `posts` stays `posts`.
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

- **The benchmark fixture test does not depend on checkout line endings.** A
  Windows clone with `core.autocrlf=true` failed a comparison that had nothing
  to do with the data. `.gitattributes` pins LF, marks the hashed upstream SQL
  as untouchable, and the test normalises newlines before comparing.

### Fixed: the measurement harness

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
  load in sorted order, hence the `005_`/`010_`/`020_` prefixes.
- The reference application logs on `onResponse` rather than `onRequest`. The
  server's own logger already writes an "incoming request" line, so the hook was
  duplicating it; it now records the status code, which was the missing part.
- Documentation, comments and CLI output do not use the em dash.
  `npm run lint:prose` enforces this and CI runs it. Two rows of the pinned
  TechEmpower fixture are exempt, because they are verbatim upstream data.

### Documentation

- A README in the shape the ecosystem expects: badges, install, features, a
  runnable example, benchmarks, then the guide index.
- `SECURITY.md` with a disclosure process, a scope, and the guarantees a report
  can be written against.
- `CONTRIBUTING.md` covering setup, how `@lughjs/core` resolves in the
  workspace, the checks CI runs, and the fixture rules.
- `CODE_OF_CONDUCT.md`, `docs/README.md` as a guide index, and
  `docs/deployment.md` covering environment, migrations as a deploy step,
  containers, health checks, proxies and the shutdown budget.
- A README for `apps/demo` that maps each pattern to the file demonstrating it.
- Issue and pull request templates, with security reports routed to the private
  advisory form rather than a public issue.
- A package README for the npm page, `.gitattributes`, and
  `repository`/`homepage`/`bugs` metadata on both manifests.
