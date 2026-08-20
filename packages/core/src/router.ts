import type { AwilixContainer } from 'awilix'
import { toCamelCase } from './container.js'
import type { Handler, LughSchema, LughServer, Middleware } from './http.js'

export type RouteHandler = string | Handler
export type RouteHandlerFn = Handler
export type RouteMiddleware = Middleware

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface RouteRegistration {
  method: HttpMethod[]
  url: string
  handler: RouteHandler
  schema?: LughSchema
  middleware?: Middleware[]
}

export class RouteBuilder {
  constructor(
    private readonly router: RouteRegistrar,
    private readonly registration: RouteRegistration,
  ) {}

  /**
   * Attaches a JSON Schema. It is compiled once, while the app boots, so a
   * request never pays for parsing or interpreting it.
   *
   * Besides `body`/`params`/`querystring`, declare `response`. Doing so both
   * speeds up serialization and turns the schema into an allow-list: a property
   * you did not list cannot appear in the response, whatever the handler
   * returns. That is the only way to make "this column never leaves the
   * process" a guarantee rather than a habit.
   */
  schema(schema: LughSchema): this {
    this.registration.schema = schema
    return this
  }

  /** Attaches one or more guards that run before this route's handler. */
  middleware(...hooks: Middleware[]): this {
    this.registration.middleware = [...(this.registration.middleware ?? []), ...hooks]
    return this
  }

  /** Finishes the builder; returns the registrar for chaining. */
  end(): RouteRegistrar {
    return this.router
  }
}

/**
 * Collects the route table, then installs it.
 *
 * A route is declared either with an inline function or with a
 * `'Controller.action'` string. The string is resolved ONCE, while the app
 * boots: the container builds the controller, the action is bound to it, and
 * what the server stores is a plain function. Nothing is looked up, parsed or
 * allocated per request: the indirection exists only in your source.
 */
export class RouteRegistrar {
  private registrations: RouteRegistration[] = []
  private prefix = ''

  get(url: string, handler: RouteHandler): RouteBuilder {
    return this.add(['GET'], url, handler)
  }

  post(url: string, handler: RouteHandler): RouteBuilder {
    return this.add(['POST'], url, handler)
  }

  put(url: string, handler: RouteHandler): RouteBuilder {
    return this.add(['PUT'], url, handler)
  }

  patch(url: string, handler: RouteHandler): RouteBuilder {
    return this.add(['PATCH'], url, handler)
  }

  delete(url: string, handler: RouteHandler): RouteBuilder {
    return this.add(['DELETE'], url, handler)
  }

  head(url: string, handler: RouteHandler): RouteBuilder {
    return this.add(['HEAD'], url, handler)
  }

  options(url: string, handler: RouteHandler): RouteBuilder {
    return this.add(['OPTIONS'], url, handler)
  }

  /**
   * Declares every route inside the callback under a shared URL prefix.
   * Groups nest, and the previous prefix is restored afterwards even if the
   * callback throws, so a failed group cannot leak its prefix onto later routes.
   */
  group(prefix: string, declare: (route: RouteRegistrar) => void): RouteRegistrar {
    const previous = this.prefix
    this.prefix = joinUrl(previous, prefix)
    try {
      declare(this)
    } finally {
      this.prefix = previous
    }
    return this
  }

  /** Declares the five REST routes for a controller in one call. */
  resource(url: string, controller: string, opts: { only?: string[] } = {}): RouteRegistrar {
    const only = new Set(opts.only ?? ['index', 'store', 'show', 'update', 'destroy'])
    if (only.has('index')) this.get(url, `${controller}.index`)
    if (only.has('store')) this.post(url, `${controller}.store`)
    if (only.has('show')) this.get(`${url}/:id`, `${controller}.show`)
    if (only.has('update')) {
      this.put(`${url}/:id`, `${controller}.update`)
      this.patch(`${url}/:id`, `${controller}.update`)
    }
    if (only.has('destroy')) this.delete(`${url}/:id`, `${controller}.destroy`)
    return this
  }

  private add(method: HttpMethod[], url: string, handler: RouteHandler): RouteBuilder {
    const registration: RouteRegistration = { method, url: joinUrl(this.prefix, url), handler }
    this.registrations.push(registration)
    return new RouteBuilder(this, registration)
  }

  reset(): void {
    this.registrations = []
    this.prefix = ''
  }

  list(): RouteRegistration[] {
    return this.registrations
  }

  /** Installs every collected registration on the server. */
  register(server: LughServer, container: AwilixContainer): void {
    for (const reg of this.registrations) {
      const handler = resolveHandler(reg.handler, container)
      server.route({
        method: reg.method,
        url: reg.url,
        schema: reg.schema,
        onRequest: reg.middleware,
        handler,
      })
    }
  }
}

function joinUrl(prefix: string, url: string): string {
  if (!prefix) return url
  const left = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
  const right = url.startsWith('/') ? url : `/${url}`
  return right === '/' ? left || '/' : `${left}${right}`
}

function resolveHandler(handler: RouteHandler, container: AwilixContainer): Handler {
  if (typeof handler === 'function') return handler

  // 'PostsController.index' | 'postsController.index'
  const dot = handler.lastIndexOf('.')
  if (dot <= 0 || dot === handler.length - 1) {
    throw new Error(`[lugh] Invalid route handler "${handler}". Expected "Controller.action".`)
  }
  const controllerKey = toCamelCase(handler.slice(0, dot))
  const action = handler.slice(dot + 1)
  if (!container.hasRegistration(controllerKey)) {
    throw new Error(
      `[lugh] Route handler "${handler}" resolves to container key "${controllerKey}", which is not registered. ` +
        `Expected a class in app/controllers whose file name maps to "${controllerKey}".`,
    )
  }
  const controller = container.resolve<Record<string, Handler>>(controllerKey)
  const fn = controller[action]
  if (typeof fn !== 'function') {
    throw new Error(`[lugh] Controller "${controllerKey}" has no action "${action}".`)
  }
  return fn.bind(controller)
}

/** The route facade imported by `start/routes`. */
export const Route = new RouteRegistrar()
