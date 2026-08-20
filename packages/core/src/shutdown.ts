import type { Knex } from 'knex'
import type { LughServer } from './http.js'

export interface ShutdownOptions {
  /** Budget for the whole sequence: drain + pool close. Default 10s. */
  timeoutMs?: number
  logger?: (msg: string) => void
}

export interface ShutdownResult {
  /** False when a phase hit its deadline and was abandoned. */
  clean: boolean
  drainedMs: number
}

/** Resolves to `timedOut` if `promise` has not settled within `ms`. */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | 'timedOut'> {
  let timer: NodeJS.Timeout
  const deadline = new Promise<'timedOut'>((resolve) => {
    timer = setTimeout(() => resolve('timedOut'), ms)
    // Unreferenced, so an idle process is never held open by the deadline alone.
    timer.unref?.()
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

/**
 * Stops accepting connections, lets in-flight requests finish, then closes the
 * database pool.
 *
 * `timeoutMs` bounds the WHOLE sequence rather than just the pool close: one
 * request that never completes must not be able to hold the process open
 * forever. The result says whether every phase finished inside its budget, so
 * the caller can pick an exit code that reflects reality.
 */
export async function gracefulShutdown(
  server: LughServer,
  db: Knex,
  opts: ShutdownOptions = {},
): Promise<ShutdownResult> {
  const log = opts.logger ?? ((msg: string) => server.log?.info?.(msg))
  const timeoutMs = opts.timeoutMs ?? 10_000
  const startedAt = Date.now()
  let clean = true

  log('stopping the server (no new connections)')
  const closed = await withDeadline(server.close(), timeoutMs)
  if (closed === 'timedOut') {
    clean = false
    log(`drain exceeded ${timeoutMs}ms — abandoning in-flight requests`)
  }
  const drainedMs = Date.now() - startedAt

  const remaining = Math.max(1_000, timeoutMs - drainedMs)
  log('closing the database pool')
  const destroyed = await withDeadline(db.destroy(), remaining)
  if (destroyed === 'timedOut') {
    clean = false
    log(`the database pool did not close within ${remaining}ms`)
  }

  log(clean ? 'shutdown complete' : 'shutdown completed with timeouts')
  return { clean, drainedMs }
}

/**
 * Installs SIGINT/SIGTERM handlers that shut down and then exit.
 *
 * Exits 0 only on a clean shutdown; a timeout exits 1, so an orchestrator can
 * tell a graceful stop from an abandoned one. A second signal exits at once —
 * if someone presses Ctrl+C twice they mean it.
 */
export function installShutdownHandlers(server: LughServer, db: Knex, opts: ShutdownOptions = {}): void {
  let shuttingDown = false

  const handler = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      process.exit(1)
    }
    shuttingDown = true
    opts.logger?.(`received ${signal}`)
    gracefulShutdown(server, db, opts)
      .then((result) => process.exit(result.clean ? 0 : 1))
      .catch((err) => {
        console.error('shutdown failed', err)
        process.exit(1)
      })
  }

  process.on('SIGINT', handler)
  process.on('SIGTERM', handler)
}
