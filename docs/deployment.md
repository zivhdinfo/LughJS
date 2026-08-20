# Deployment

What to set, how to start the process, and how to stop it without dropping
requests.

## Before the first deploy

- [ ] `NODE_ENV=production`
- [ ] every variable in `config/env` injected by the platform, not read from a
      file committed anywhere
- [ ] `JWT_SECRET` from a secret store, rotated away from the one `lugh new`
      generated
- [ ] `CORS_ORIGIN` set to the origins that really call the API
- [ ] `trustProxy` set if and only if a proxy is in front
- [ ] migrations run as their own step, before the new process starts
- [ ] `response` schemas on any route that returns user records
- [ ] `npm audit --omit=dev` clean

The security side of this list is explained in [security.md](security.md).

## Environment

`config/env` is the contract. Every variable an application reads is declared
there with a type, and the boot fails with all of the offending names when one
is missing or malformed. That failure is the feature: a container that will not
start is a deploy that rolls back, rather than a service that answers requests
with a placeholder secret.

`.env` is loaded from the project root if it exists, and it does **not**
override variables that are already set. A platform that injects real
environment variables therefore always wins, and the same image works in
development and in production without a conditional.

```bash
NODE_ENV=production
HOST=0.0.0.0          # 127.0.0.1 is the default and is not reachable from outside a container
PORT=3000
LOGGER=true
JWT_SECRET=...        # from the secret store
```

`HOST` is the one people miss. The scaffold defaults to `127.0.0.1`, which is
right on a laptop and wrong inside a container, where nothing outside the
network namespace can reach it.

## Running migrations

Run them as a separate step that has to succeed before the new version starts
serving. Do not run them from inside the server process on boot: several
instances starting at once would race, and a failed migration would leave you
with a running server on a half-migrated schema.

```bash
npm run migrate        # lugh migration:run
```

`lugh migration:run` exits non-zero when a migration throws, so it works as a
gate in a pipeline. Knex runs each batch in a transaction where the dialect
supports one, so a migration that fails part way does not leave the batch half
applied.

`lugh migration:status` prints what has run and what is pending, which is the
quickest way to see what a deploy is about to do.

## Starting the process

```bash
npm start              # lugh serve
```

`lugh serve` spawns the server as a child process and forwards `SIGINT` and
`SIGTERM` to it, so the application's own shutdown handlers run. It exits with
the child's status, or `128 + n` when the child was terminated by signal `n`.

The extra process is one level of indirection you may not want as PID 1 in a
container. Starting the entry point directly is equivalent and removes it:

```bash
node --import tsx start/server.ts
```

The loader is required because your project's config, routes, migrations and
controllers are TypeScript and run from source. The framework itself is
compiled, so nothing in `@lughjs/core` is transformed at startup. A
`--language=js` project needs no loader at all:

```bash
node start/server.js
```

## Shutting down

`installShutdownHandlers(server, db)` is in the generated `start/server.ts`, and
it is what makes a rolling deploy not drop requests:

1. the server stops accepting connections
2. requests already in flight are allowed to finish
3. the database pool is closed

The whole sequence has a budget, 10 seconds by default, and the exit code
reports what happened: `0` if every phase finished inside it, `1` if a phase hit
the deadline and was abandoned. A second signal exits immediately, because
somebody pressing Ctrl+C twice means it.

```ts
installShutdownHandlers(server, db, {
  timeoutMs: 15_000,
  logger: (msg) => server.log.info(msg),
})
```

Set your orchestrator's grace period **longer** than `timeoutMs`. In Kubernetes
that is `terminationGracePeriodSeconds`; if it is shorter, the platform sends
`SIGKILL` in the middle of the drain and the budget never applies.

## Behind a proxy

The rate limiter and anything else that keys on the client address see the
proxy, not the client, unless the app is told to trust the forwarded header.

```ts
// config/app.ts
export default {
  name: 'my-app',
  logger: true,
  server: { trustProxy: true },
}
```

Turn it on only when a proxy you control really is in front. Otherwise a client
can forge `X-Forwarded-For` and evade the very limit you were trying to apply.

## Logging

Logging is Pino, writing JSON to stdout, which is what a log shipper wants.
`logger` in `config/app` takes `true`, `false`, or an options object:

```ts
export default {
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
}
```

A line per request is the right default while developing and a real cost under
load. Measure it before deciding: [testing-and-measurements.md](testing-and-measurements.md)
records what it costs on one machine.

The error handler always logs the full error server-side at `error` level, even
though the response body is generic. Those logs are the only place the detail
exists in production, so ship them.

## Health checks

The scaffold registers `/health`, which returns `{ "status": "ok" }`.

It answers as soon as the server is listening, which is exactly what a liveness
check wants, and it says nothing at all about the database. If your readiness check needs to gate
on the connection, write a controller that actually touches it. The container
registers `db` as a value, so a constructor parameter of that name receives it:

```ts
// app/controllers/health_controller.ts
import type { LughReply, LughRequest } from '@lughjs/core'
import type { Knex } from 'knex'

export default class HealthController {
  constructor(private readonly db: Knex) {}

  async ready(request: LughRequest, reply: LughReply) {
    try {
      await this.db.raw('select 1')
      return { status: 'ok' }
    } catch (err) {
      request.log.error({ err }, 'readiness probe failed')
      return reply.code(503).send({ status: 'unavailable' })
    }
  }
}
```

```ts
// start/routes.ts
Route.get('/ready', 'HealthController.ready')
```

Keep liveness and readiness separate. A liveness check that fails when the
database blinks gets your healthy process restarted for no reason.

## Containers

```dockerfile
FROM node:22-slim

WORKDIR /app

# Native modules: better-sqlite3 and some drivers build from source.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["node", "--import", "tsx", "start/server.ts"]
```

Three things about this file are deliberate:

- `--omit=dev` is safe. The loader your project needs at runtime arrives as a
  dependency of `@lughjs/core`, not as a dev dependency of your app. Only
  TypeScript itself, used for `npm run typecheck`, is dropped.
- `HOST=0.0.0.0` for the reason above.
- The build toolchain is present because `better-sqlite3` and some database
  drivers compile native code. On `node:22-alpine` you need
  `apk add --no-cache python3 make g++` instead, and musl builds are less well
  covered by prebuilt binaries.

Run migrations as a separate command against the same image rather than in
`CMD`, so that scaling to two replicas does not run them twice:

```bash
docker run --rm --env-file .env.production my-app npm run migrate
```

## Process managers

Under systemd or PM2, send `SIGTERM` to stop and give the shutdown budget room:

```ini
[Service]
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --import tsx /srv/my-app/start/server.ts
WorkingDirectory=/srv/my-app
KillSignal=SIGTERM
TimeoutStopSec=20
Restart=on-failure
```

`WorkingDirectory` matters. `createApp(process.cwd())` resolves `config/`,
`app/`, `start/` and `database/` from the current directory, so a process
started somewhere else will not find the project and will say so at boot.

## Connection pools

`config/database` carries the pool, and the right size is a property of your
database rather than of your application. One connection per instance
multiplied by the number of instances has to stay under the server's limit.

```ts
pool: { min: 2, max: 10 }
```

SQLite is the exception the scaffold ships with: `{ min: 1, max: 1 }`, because
concurrent writers to one file serialise anyway. SQLite is a fine default for
development and for small single-instance deployments, and it is not a fit for
several instances behind a load balancer.
