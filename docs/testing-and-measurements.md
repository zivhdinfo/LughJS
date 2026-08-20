# Testing and measurements

What is tested, what was measured, and how much either is worth.

```bash
npm test            # the whole suite
npm run bench       # the measurement harness
```

## The suite

**56 tests, all passing.** They run against real code: a real boot, a real
SQLite database, real HTTP requests, a real child process for the signal test.
Nothing important is mocked, because a mock of the boot sequence would only
prove the mock works.

### Boot and wiring: `router.test.ts`, `di.test.ts`

- `createApp` boots and routes resolve through the container
- a validated POST creates a row; an invalid body is rejected with 400
- 404 handling and a DELETE round-trip
- global middleware from `app/middleware` is applied
- per-route middleware runs only on its route
- the container resolves classes by constructor parameter name
- services are singletons, returning the same instance on every resolve
- a module whose default export is not a class is rejected

### Failure behaviour: `hardening.test.ts`

- an invalid schema fails at **boot**, not on the first request
- validation errors produce a 400 with a consistent JSON shape
- an unknown route produces a 404 with a JSON body
- **a 500 never echoes the internal error message**. The test asserts the
  generic message in both environments, that the detail is present outside
  production, and that nothing internal appears anywhere in the production body
- graceful shutdown drains an in-flight request, then closes the pool
- a missing required env var fails fast with a message naming it
- an env value outside its declared choices fails fast
- SIGTERM triggers graceful shutdown in a real child process

### Database: `migration.test.ts`, `migration-commands.test.ts`

- `migration:run` creates tables, `rollback` drops them, `fresh` re-runs them
- `migration:status` reports completed and pending accurately
- `migration:refresh` rolls back everything and re-runs, exercising the `down()`
  paths against real data
- `migration:reset` leaves the schema empty
- a migration that throws mid-batch rolls back inside a transaction
- running seeders twice does not duplicate rows
- `db:seed --class` runs only the named seeder

### The scaffolder: `scaffold.test.ts`

- a TypeScript + SQLite project without auth
- a JavaScript project with **no `.ts` file anywhere** and no TypeScript syntax
  leaking into the templates
- each database choice pulls in its own driver and writes its own config
- the auth scaffold generates a real random secret into `.env`, declares
  `JWT_SECRET` with no default, keeps the placeholder in `.env.example`, and
  emits a guard that returns its reply
- **the generated TypeScript project typechecks** under `strict`,
  `noUncheckedIndexedAccess` and `noImplicitOverride`
- it refuses to write into a non-empty directory, and rejects names that are not
  valid package names

That typecheck test is the one that earns its place. It caught three real
defects in the templates that no amount of reading would have.

### Regressions: `regressions.test.ts`

Thirteen tests, one per defect found during the audit that produced 2.0.0. Each
fails against the previous implementation:

- a file name and its class name resolve to the **same** container key, acronyms
  included (`APIController` ↔ `api_controller.ts`)
- a colliding container key is a boot error, not a silent overwrite
- a module that would shadow `db`/`config`/`env` is refused
- `Route.group` prefixes its children and restores the prefix, including when
  the callback throws
- an unknown controller names the key it looked for
- **`migration:fresh` drops a table no migration owns; `refresh` does not**.
  the test creates an orphan table and checks each command's effect on it
- `listTables` ignores engine-internal tables
- a migration name keeps table words that merely contain a verb
  (`create_addresses` → `addresses`, not `resses`)
- `pluralize` never double-pluralises
- timestamps are unique within the same second
- a name that cannot form a class is rejected up front
- an ambiguous `--class` seeder is an error, not a coin flip

### Fixture integrity: `bench/test/fortunes.test.ts`

The render suite's dataset is pinned and checksummed, and five tests fail if it
drifts, including one asserting the deliberately hostile row is still there, so
the escaping check cannot quietly stop testing anything.

## End-to-end verification

Beyond the suite, both scaffold variants were generated, installed and run
against a live server for 2.0.0:

| check | TypeScript + SQLite + auth | JavaScript + SQLite |
|---|---|---|
| `migration:run`, `db:seed`, `list:routes` | ✅ | ✅ |
| server boots and answers `/health` | ✅ | ✅ |
| register → login → `/me` round trip | ✅ | n/a |
| `POST` without a token | **401** | n/a |
| `POST` with a token | **201** | ✅ |
| invalid body | **400** with `errors[]` | **400** with `errors[]` |
| `password_hash` anywhere in a response | **absent** | n/a |

## Measurements

`npm run bench` writes [bench/BENCHMARKS.md](../bench/BENCHMARKS.md).

### What it measures

Four suites against a real application, booted through `createApp`, with the
container, the controllers and the database in the path:

| suite | what it exercises |
|---|---|
| `json` | route match and serialization, no I/O |
| `query` | controller → service → one indexed row out of 10,000 |
| `render` | a full table read, HTML escaping, an added row, a sort |
| `write` | schema validation, an insert, a serialized 201 |

Then the same application again with security headers, CORS, rate limiting and
token verification switched on, so the report separates the cost of the
middleware from the cost of the work.

Startup time and resident memory, idle and under load, are recorded from the
server's own process.

### How it protects itself

A benchmark is worth exactly what its method is worth, so the harness is built
to distrust its own output:

- **The server runs in its own process.** A load generator sharing an event loop
  with the server measures the two of them fighting.
- **Every endpoint is verified before it is timed**: status, content type and
  body. The render suite asserts the hostile row comes back escaped and the
  request-time row is present.
- **A single non-2xx during a measured run fails the whole benchmark.** This is
  the rule that matters most. An error response is *cheaper* to produce than
  real work, so without it a rate limit, a broken query or a validation slip
  makes the numbers go **up** while the server does nothing useful.
- **The median of five rounds is reported, never the best.** Taking the maximum
  systematically flatters, and rewards whichever run went wrong in a way that
  made replies cheaper.
- **Every individual sample is printed**, so the spread is visible instead of
  hidden behind an average.
- **A discarded warmup follows every boot**, so nothing is timed before the JIT
  and the connection pool have settled.
- **Memory is read from the server's process id**, not the harness's.

### What the last run measured

Recorded on an i5-10400F (12 threads), 32 GB, Windows 11, Node 24.18, over 5 rounds
of 10s at 64 concurrent connections, median reported. Every suite returned the
expected status, content type and body on every measured run.

| suite | req/s | p50 | p99 | spread |
|---|---|---|---|---|
| `json` | 28,553 | 2.00 ms | 3.00 ms | ±7.4% |
| `query` | 10,030 | 6.00 ms | 9.00 ms | ±4.4% |
| `render` | 8,893 | 6.00 ms | 10.00 ms | ±5.5% |
| `write` | 6,400 | 9.00 ms | 19.00 ms | ±6.5% |

Cold start 953 ms; resident memory 110 MB idle, 305 MB under load.

The hardened profile (security headers, CORS, rate limiting, token
verification) costs roughly a quarter of throughput on the suites that touch the
database, and nearly half on the one that does not:

| suite | plain | hardened | cost |
|---|---|---|---|
| `json` | 28,553 | 15,632 | −45.3% |
| `query` | 10,030 | 7,345 | −26.8% |
| `render` | 8,893 | 6,494 | −27.0% |
| `write` | 6,400 | 4,917 | −23.2% |

`json` pays the most because it is the only suite with no I/O to hide the
middleware behind: the fixed per-request cost is the whole cost. On the three
suites that touch the database the same middleware costs between 23% and 27%,
which is the honest way to read that first number too.

The spread across rounds stayed between ±4.4% and ±7.4%, so a change worth
acting on has to be larger than that before it means anything. An earlier run of
the same build reported ±0.9% to ±3.8% on a quieter machine, which is the point
of printing the spread at all: it tells you how much of a difference between two
runs is the machine rather than the code.

### Reading the numbers

They come from a desktop that was also running other software. Treat them as a
baseline for **that machine**: good for catching a regression between two runs,
not for quoting as the throughput of a tuned deployment. Two runs on the same
machine are comparable; a number from this file and a number from somewhere else
are not.

Two things dominate the cost of a real request, and both are visible in the
report rather than argued about:

- **Logging.** `logger` defaults to `true`, which is a line written per request.
- **The hardened middleware**, whose measured cost is in its own table.

### Tuning a run

`bench/profile.ts` holds the load shape, and every knob has an environment
override for a quick check without editing the committed profile:

```bash
BENCH_ROUNDS=1 BENCH_DURATION=2 BENCH_WARMUP=2 npm run bench
```

More rounds narrows the spread. The printed per-round samples tell you when you
have enough.
