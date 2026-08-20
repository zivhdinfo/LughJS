import type { LughReply, LughRequest } from '@lughjs/core'

/**
 * Per-route auth guard: `Route.post('/posts', 'C.store').middleware(auth)`.
 *
 * This file has no default export, so `createApp` leaves it alone rather than
 * treating it as global middleware.
 *
 * The `return` in front of `reply.send` matters: a guard that sends a reply
 * without returning it does not stop the request — the route handler still
 * runs, against a reply that has already been sent.
 */
export async function auth(request: LughRequest, reply: LughReply): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ message: 'Unauthorized' })
  }
}
