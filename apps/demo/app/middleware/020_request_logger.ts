import type { LughServer } from '@lughjs/core'

/**
 * Global middleware: logs each request (only when logging is enabled).
 * Registered automatically from app/middleware at boot.
 */
export default async function requestLogger(server: LughServer): Promise<void> {
  server.addHook('onRequest', async (request) => {
    request.log.info({ method: request.method, url: request.url }, 'incoming request')
  })
}
