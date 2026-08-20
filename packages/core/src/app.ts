import createServer from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AwilixContainer } from 'awilix'
import { loadEnv, type EnvSpecs } from './env.js'
import { createDatabase, type MigrationResult } from './database.js'
import { buildContainer, registerFolder } from './container.js'
import { RouteRegistrar, Route } from './router.js'
import type { LughServer, LughServerOptions, ServerPlugin } from './http.js'
import type { Knex } from 'knex'

export interface AppConfig {
  name?: string
  /**
   * Request logging. Defaults to `true`, which writes a line per request:
   * the right default while developing, and a real cost under load. Pass
   * `false`, or a level object, when that matters.
   */
  logger?: boolean | LughServerOptions['logger']
  /** Low-level server options: `trustProxy`, `bodyLimit`, `http2`, … */
  server?: Omit<LughServerOptions, 'logger'>
  [key: string]: unknown
}

export interface LughApp {
  /** The running server. */
  server: LughServer
  db: Knex
  container: AwilixContainer
  env: Record<string, unknown>
  config: AppConfig
}

/** Extensions a project file may use, in resolution order. */
const PROJECT_EXTENSIONS = ['.ts', '.js', '.mjs']

/**
 * Resolves `<root>/<...segments>` to a real file, trying each extension, so a
 * JavaScript project, which has no `.ts` anywhere, boots the same way.
 */
function resolveProjectFile(root: string, ...segments: string[]): string {
  const base = path.join(root, ...segments)
  for (const e of PROJECT_EXTENSIONS) {
    if (fs.existsSync(base + e)) return base + e
  }
  throw new Error(
    `[lugh] Not a Lugh project: expected ${base}${PROJECT_EXTENSIONS.join(' or ')} (run from your project root)`,
  )
}

async function importNamespace(file: string): Promise<Record<string, unknown>> {
  return (await import(pathToFileURL(file).href)) as Record<string, unknown>
}

async function importDefault<T>(file: string): Promise<T> {
  const mod = await importNamespace(file)
  return (mod.default ?? mod) as T
}

/**
 * Boots share one process-global route registrar, so two overlapping calls
 * would interleave their route tables. Boots are therefore queued; sequential
 * boots (tests, benchmarks, a reload) are unaffected.
 */
let bootQueue: Promise<unknown> = Promise.resolve()

/**
 * Boots an application from a project root.
 *
 * The order below is the whole framework. Everything expensive (reading
 * config, opening the pool, constructing services, compiling schemas, binding
 * controller methods) happens exactly once, here. What is left for a request
 * to do is run your handler.
 *
 *  1. load and validate the environment
 *  2. load `config/app` and `config/database`
 *  3. open the database connection and bind the models to it
 *  4. build the container; register `app/services` then `app/controllers`
 *  5. create the server
 *  6. run `app/middleware` in file-name order
 *  7. call `start/routes` and install the collected table
 *  8. install the not-found and error handlers
 */
export function createApp(root: string): Promise<LughApp> {
  const next = bootQueue.then(
    () => bootApp(root),
    () => bootApp(root),
  )
  bootQueue = next.catch(() => undefined)
  return next
}

async function bootApp(root: string): Promise<LughApp> {
  const envSpecs = await importDefault<EnvSpecs>(resolveProjectFile(root, 'config', 'env'))
  const env = loadEnv(root, envSpecs)
  const config = await importDefault<AppConfig>(resolveProjectFile(root, 'config', 'app'))
  const dbConfig = await importDefault<Knex.Config>(resolveProjectFile(root, 'config', 'database'))

  let db: Knex
  try {
    db = createDatabase(dbConfig)
  } catch (err) {
    throw explainDriverFailure(err, root)
  }
  const container = buildContainer({ db, config, env })

  await registerFolder(container, path.join(root, 'app', 'services'))
  await registerFolder(container, path.join(root, 'app', 'controllers'))

  const server = createServer({ ...(config.server ?? {}), logger: config.logger ?? true })

  // Middleware runs before routes so that a module registering shared schemas
  // has done so by the time a route references one.
  await registerMiddleware(server, path.join(root, 'app', 'middleware'))

  Route.reset()
  const routesFile = resolveProjectFile(root, 'start', 'routes')
  const routesModule = await importNamespace(routesFile)
  const declareRoutes = routesModule.default
  // The route table must be declared inside a function. A module body is
  // evaluated once per process, so routes written at the top level would
  // register on the first boot and silently vanish on the second: in a test,
  // a benchmark, or after a reload.
  if (typeof declareRoutes !== 'function') {
    throw new Error(
      `[lugh] ${routesFile} must default-export a function that declares the routes:\n` +
        `\n  import { Route } from '@lughjs/core'\n\n  export default function routes() {\n    Route.get('/health', async () => ({ status: 'ok' }))\n  }\n`,
    )
  }
  await (declareRoutes as (route: RouteRegistrar) => unknown)(Route)
  Route.register(server, container)

  server.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ message: `Route ${request.method}:${request.url} not found` })
  })

  installErrorHandler(server, env)

  await server.ready()

  return { server, db, container, env, config }
}

/**
 * Turns a missing database driver into something readable.
 *
 * knex throws when it cannot require the driver for the configured client, and
 * the message arrives wrapped in a six-frame require stack pointing into knex's
 * own internals. The cause is almost always that nobody has run `npm install`
 * in the project yet, and nothing in that stack says so. The driver name is
 * kept, because it is the one useful piece of the original.
 */
function explainDriverFailure(err: unknown, root: string): unknown {
  const message = err instanceof Error ? err.message : String(err)
  const missing = /Cannot find module '([^']+)'/.exec(message)
  if (!missing) return err

  const driver = missing[1]
  const installed = fs.existsSync(path.join(root, 'node_modules'))
  const hint = installed
    ? `Add it with: npm install ${driver}`
    : `There is no node_modules in ${root}. Run: npm install`

  return new Error(
    `[lugh] The database driver "${driver}" is not available.\n\n` +
      `config/database asks for it, so the connection cannot be opened.\n` +
      `${hint}`,
    { cause: err },
  )
}

interface HttpErrorLike {
  statusCode?: number
  validation?: Array<{ instancePath?: string | string[]; message?: string }>
  message?: string
  stack?: string
}

function isHttpError(err: unknown): err is HttpErrorLike {
  return typeof err === 'object' && err !== null
}

/**
 * One error shape for the whole application.
 *
 *  - a failed schema → 400, with the offending fields listed in `errors[]`
 *  - an error carrying a 4xx `statusCode` → that status and its message, since
 *    a deliberate 4xx exists in order to be read
 *  - anything else → 500, and a GENERIC message
 *
 * The 500 rule is not caution for its own sake. Database drivers put the failing
 * statement, *including the values bound into it*, in `err.message`. Passing
 * that through would answer an anonymous request with your table names, your
 * column names, your constraints and a row of real data. So `message` is
 * `Internal Server Error` in every environment, and the detail is attached
 * separately, only outside production, where a developer is the one reading it.
 * The real error always goes to the log.
 */
export function installErrorHandler(server: LughServer, env: Record<string, unknown>): void {
  const isProduction = String(env.NODE_ENV) === 'production'
  server.setErrorHandler((err, request, reply) => {
    const httpErr = isHttpError(err) ? err : undefined
    const validation = httpErr?.validation
    const statusCode =
      httpErr?.statusCode && httpErr.statusCode >= 400 && httpErr.statusCode < 600
        ? httpErr.statusCode
        : validation
          ? 400
          : 500

    const isServerError = statusCode >= 500
    const payload: Record<string, unknown> = {
      message: isServerError ? 'Internal Server Error' : (httpErr?.message ?? 'Request failed'),
    }

    if (validation && Array.isArray(validation)) {
      payload.errors = validation.map((v) => ({
        field: Array.isArray(v.instancePath) ? v.instancePath.join('.') : (v.instancePath ?? ''),
        message: v.message ?? 'invalid value',
      }))
    }

    if (isServerError) {
      request.log.error({ err }, 'unhandled error')
      if (!isProduction) {
        payload.error = httpErr?.message
        if (httpErr?.stack) payload.stack = httpErr.stack.split('\n')
      }
    }

    reply.code(statusCode).send(payload)
  })
}

/**
 * Runs every module in `app/middleware` that default-exports a function, in
 * sorted file-name order, which is why the generated files carry `005_`,
 * `010_`, `020_` prefixes: the number IS the ordering mechanism.
 *
 * A module with NO default export is skipped, deliberately. That is the
 * convention for per-route guards such as `auth.ts`, which `start/routes`
 * imports by name and attaches with `.middleware(...)`. A default export that
 * is not callable is an error rather than a silent skip, because it is always a
 * mistake.
 */
async function registerMiddleware(server: LughServer, dir: string): Promise<void> {
  if (!fs.existsSync(dir)) return
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(ts|js|mjs)$/.test(f) && !f.endsWith('.d.ts'))
    .sort()
  for (const file of files) {
    const full = path.join(dir, file)
    const mod = await importNamespace(full)
    if (!('default' in mod) || mod.default === undefined) continue
    if (typeof mod.default !== 'function') {
      throw new Error(
        `[lugh] ${full} default-exports a ${typeof mod.default}; global middleware must export a function (server) => void`,
      )
    }
    await (mod.default as ServerPlugin)(server)
  }
}

/** Convenience: run pending migrations at boot (opt-in). */
export async function migrate(app: LughApp, dir?: string): Promise<MigrationResult> {
  const { runMigrations } = await import('./database.js')
  return runMigrations(app.db, dir)
}
