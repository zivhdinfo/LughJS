// Public API of @lughjs/core.
//
// Application code should never need to import anything else: the HTTP types
// an app touches are re-exported here under Lugh names.

// HTTP surface
export type {
  LughRequest,
  LughReply,
  LughServer,
  LughSchema,
  LughServerOptions,
  Handler,
  Middleware,
  ServerPlugin,
} from './http.js'

// Application
export { createApp, migrate, installErrorHandler, type LughApp, type AppConfig } from './app.js'
export {
  gracefulShutdown,
  installShutdownHandlers,
  type ShutdownOptions,
  type ShutdownResult,
} from './shutdown.js'

// Routing
export {
  Route,
  RouteRegistrar,
  RouteBuilder,
  type RouteRegistration,
  type RouteHandler,
  type RouteHandlerFn,
  type RouteMiddleware,
  type HttpMethod,
} from './router.js'

// Persistence
export { BaseModel } from './base-model.js'
export {
  createDatabase,
  runMigrations,
  rollbackMigrations,
  refreshMigrations,
  freshMigrations,
  resetMigrations,
  migrationStatus,
  runSeeders,
  listTables,
  dropAllTables,
  type MigrationResult,
  type MigrationStatusEntry,
} from './database.js'

// Container and configuration
export { buildContainer, registerFolder, toCamelCase, type ContainerDeps } from './container.js'
export { loadEnv, type EnvSpecs } from './env.js'
