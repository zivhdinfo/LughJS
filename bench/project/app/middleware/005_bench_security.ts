import type { LughServer } from '@lughjs/core'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import jwt from '@fastify/jwt'
import { PROFILE } from '../../../profile.js'

/**
 * The hardened profile: security headers, CORS, rate limiting and token
 * verification. Switched on with `BENCH_SECURITY=1`, so the runner can measure
 * the same application twice and report what this set costs.
 *
 * These are ecosystem plugins that deliberately publish their decorators onto
 * the root instance, so `register` is the right entry point for them.
 * unlike a plain hook module, which Lugh invokes directly.
 */
export async function registerBenchSecurity(server: LughServer): Promise<void> {
  await server.register(helmet)
  await server.register(cors, { origin: 'http://localhost' })
  // See PROFILE.rateLimitMax: a reachable ceiling would make this a measurement
  // of how fast rejections are produced.
  await server.register(rateLimit, { max: PROFILE.rateLimitMax, timeWindow: '1 minute' })
  await server.register(jwt, { secret: 'bench-secret-not-used-for-anything-real' })
}

export default async function benchSecurity(server: LughServer): Promise<void> {
  if (process.env.BENCH_SECURITY !== '1') return
  await registerBenchSecurity(server)
}
