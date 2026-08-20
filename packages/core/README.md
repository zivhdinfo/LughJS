# @lughjs/core

**A structured HTTP framework for Node.js.** Controllers, services, models,
migrations and a dependency container, with every expensive step resolved before
the first request arrives.

```bash
npx @lughjs/core new my-app
cd my-app && npm install
npm run migrate && npm run dev
```

This package contains the framework and the `lugh` CLI. Full documentation,
guides and benchmarks live in the
[repository](https://github.com/zivhdinfo/LughJS).

## What it gives you

- A layout that survives growth: `app/controllers`, `app/services`,
  `app/models`, `app/middleware`, `config/`, `database/`, `start/routes`
- Dependency injection by parameter name, with no decorators or reflection
- A route table resolved at boot, so nothing is looked up per request
- Migrations, seeders, status, and a `migration:fresh` that truly drops the
  schema
- JSON Schema validation on the way in and an allow-list serializer on the way
  out
- Environment validation that stops the boot instead of the request
- TypeScript or JavaScript, with the same generators for both

## Usage

```ts
// start/server.ts
import { createApp, installShutdownHandlers } from '@lughjs/core'

const { server, db, env } = await createApp(process.cwd())

installShutdownHandlers(server, db, { logger: (msg) => server.log.info(msg) })

await server.listen({ host: String(env.HOST), port: Number(env.PORT) })
```

```ts
// start/routes.ts
import { Route } from '@lughjs/core'

export default function routes() {
  Route.get('/health', async () => ({ status: 'ok' }))

  Route.group('/api', () => {
    Route.resource('/posts', 'PostController')
  })
}
```

## CLI

```bash
lugh new [name]                 # scaffold a project
lugh make:controller Post       # also make:model, make:service,
lugh make:migration create_posts#   make:seeder
lugh migration:run              # also rollback, refresh, fresh, status
lugh db:seed [--class name]
lugh list:routes
lugh dev                        # watch and reload
lugh serve
```

## Requirements

Node.js 22 or newer.

The `lugh` CLI registers a TypeScript loader before importing your project, so a
TypeScript project runs with no build step. The framework itself ships compiled,
so importing `@lughjs/core` never costs a transpile.

## Documentation

- [Getting started](https://github.com/zivhdinfo/LughJS/blob/main/docs/getting-started.md)
- [Project structure](https://github.com/zivhdinfo/LughJS/blob/main/docs/project-structure.md)
- [Routing](https://github.com/zivhdinfo/LughJS/blob/main/docs/routing.md)
- [Controllers, services and DI](https://github.com/zivhdinfo/LughJS/blob/main/docs/controllers-and-di.md)
- [Database](https://github.com/zivhdinfo/LughJS/blob/main/docs/database.md)
- [Configuration](https://github.com/zivhdinfo/LughJS/blob/main/docs/configuration.md)
- [Security](https://github.com/zivhdinfo/LughJS/blob/main/docs/security.md)
- [CLI reference](https://github.com/zivhdinfo/LughJS/blob/main/docs/cli.md)

## License

MIT
