/**
 * The HTTP surface Lugh hands to application code.
 *
 * Everything an app touches (request, reply, the server instance, schemas)
 * is named here, so a controller, a service or a guard only ever imports from
 * `@lughjs/core`. Lugh runs on a battle-tested HTTP engine underneath and these
 * are that engine's own objects, passed through untouched rather than wrapped:
 * no adapter allocates a copy per request, and nothing about the underlying
 * object is hidden from you.
 */
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
  FastifyServerOptions,
} from 'fastify'

/** An incoming request: params, query, body, headers, `log`, and the raw socket. */
export type LughRequest = FastifyRequest

/** The reply being built: `code()`, `header()`, `send()`, and streaming. */
export type LughReply = FastifyReply

/** The running server. Passed to global middleware so it can add hooks. */
export type LughServer = FastifyInstance

/**
 * A JSON Schema attached to a route. `body`, `params`, `querystring` and
 * `headers` validate what comes in; `response` shapes what goes out.
 */
export type LughSchema = FastifySchema

/** Low-level server options, forwarded from `config/app`'s `server` key. */
export type LughServerOptions = FastifyServerOptions

/** A route handler: return a value to send it, or drive `reply` yourself. */
export type Handler = (request: LughRequest, reply: LughReply) => unknown

/** A guard or hook that runs before the handler. Return the reply to stop. */
export type Middleware = (request: LughRequest, reply: LughReply) => void | Promise<unknown>

/** A global middleware module's default export. */
export type ServerPlugin = (server: LughServer) => void | Promise<unknown>
