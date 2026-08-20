import type { LughServer } from '@lughjs/core'

/**
 * Global middleware, registered automatically from app/middleware at boot.
 *
 * The hook runs on `onResponse` rather than `onRequest`. Fastify's own logger
 * already writes an "incoming request" line, so logging on the way in only
 * duplicates it; the status code is the part that is worth a line of its own,
 * and it is not known until the response is on the wire.
 */
export default async function requestLogger(server: LughServer): Promise<void> {
  server.addHook('onResponse', (request, reply, done) => {
    request.log.info({ method: request.method, url: request.url, status: reply.statusCode }, 'request')
    done()
  })
}
