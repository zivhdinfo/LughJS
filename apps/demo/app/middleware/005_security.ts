import type { LughServer } from '@lughjs/core'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import jwt from '@fastify/jwt'

/**
 * Security headers, CORS, rate limiting and token verification.
 *
 * These are ecosystem plugins that deliberately publish their decorators onto
 * the root instance, so `register` is the right entry point for them. A plain
 * hook module in this folder must NOT use `register`, because Lugh invokes those
 * directly precisely so their hooks reach every route instead of being scoped
 * to a child context.
 */
export default async function security(server: LughServer): Promise<void> {
  await server.register(helmet)

  await server.register(cors, {
    // An explicit allow-list. `origin: true` reflects whatever Origin the
    // caller sent, which makes the header meaningless as a protection.
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
  })

  await server.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    timeWindow: '1 minute',
  })

  await server.register(jwt, {
    // config/env.ts declares JWT_SECRET without a default, so boot already
    // failed if it is missing. No fallback literal is defined here on purpose.
    secret: process.env.JWT_SECRET as string,
    sign: { expiresIn: process.env.JWT_EXPIRES_IN ?? '1h' },
  })
}
