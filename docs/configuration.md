# Configuration

Three files in `config/`, all plain modules with a default export.

## `config/env.ts` — the environment contract

envalid specs. They are validated at boot, against `process.env` after `.env`
has been loaded.

```ts
import { str, num, bool } from 'envalid'

export default {
  NODE_ENV: str({ default: 'development', choices: ['development', 'test', 'production'] }),
  HOST: str({ default: '127.0.0.1' }),
  PORT: num({ default: 3000 }),
  LOGGER: bool({ default: true }),
  DB_FILE: str({ default: './database/app.sqlite' }),

  // No default: the app must not boot without one.
  JWT_SECRET: str(),
}
```

A missing or malformed variable **throws during boot**, naming every variable
that failed:

```
[lugh] Invalid environment variables: JWT_SECRET: missing
```

It throws rather than calling `process.exit`, so a caller that boots the app
programmatically can catch and report it.

### Give secrets no default

A `default` on a secret is the mechanism by which an insecure placeholder ends
up signing production tokens. Declare it as `str()` with nothing else and the
failure happens at boot, on the machine that is misconfigured, instead of
silently working.

`NODE_ENV` is always validated even if your specs omit it, because the framework
reads it to decide how much detail an error response carries.

The result is a plain object, not envalid's strict proxy — reading an undeclared
key gives `undefined` rather than throwing.

## `config/app.ts` — the app and the server

```ts
export default {
  name: 'my-app',
  logger: process.env.LOGGER !== 'false',
  server: {
    trustProxy: true,
    bodyLimit: 1_048_576,
  },
}
```

| key | meaning |
|---|---|
| `name` | app name; available in the container as `config` |
| `logger` | request logging: `true`, `false`, or a level object. **Defaults to `true`.** |
| `server` | low-level server options: `trustProxy`, `bodyLimit`, `http2`, … |

`logger` defaults to `true`, which means the logger writes a line per request. That is
the right default for development and a real cost under load — turn it off when
you are measuring throughput, and consider a level rather than a boolean in
production.

`server` is a straight pass-through, which is where `trustProxy` goes. You need
it whenever the app sits behind a proxy and something downstream cares about the
client IP — rate limiting, most obviously, which otherwise sees every request as
coming from the proxy.

Anything else you put in this file is available through the container:

```ts
export default class ReportService {
  constructor(private readonly config: AppConfig) {}
  get pageSize() { return Number(this.config.pageSize ?? 25) }
}
```

## `config/database.ts` — the connection

See [database.md](database.md).

## `.env`

```
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
LOGGER=true
DB_FILE=./database/app.sqlite
JWT_SECRET=<generated>
```

`.env` is gitignored by the scaffolded `.gitignore`. `.env.example` is the
committed template and carries placeholders, never a real secret. The scaffolder
generates a fresh 32-byte `JWT_SECRET` into `.env` when you create a project,
and writes a placeholder into `.env.example`.

`.env` does not override variables that are already set in the environment, so a
container or CI runner wins over the file.

## Per-environment configuration

There is no `config/env/production.ts` layer. Branch inside the config file:

```ts
const isProd = process.env.NODE_ENV === 'production'

export default {
  name: 'my-app',
  logger: isProd ? { level: 'warn' } : true,
  server: { trustProxy: isProd },
}
```

This is deliberate: one file you can read top to bottom beats a merge order you
have to reconstruct.
