# Design notes

Why Lugh works the way it does. Each section is a decision that had a plausible
alternative, and the reason the alternative lost.

## Everything expensive happens at boot

Reading config, opening the pool, constructing services, compiling schemas,
binding controller methods. All of it runs once, in `createApp`, in a fixed
order. What is left for a request is your handler.

This is why `'PostController.index'` is a string in your source but a plain
bound function in the running server: the container is consulted while booting
and never again. The indirection is a convenience for the reader, not a cost for
the caller.

The consequence worth knowing: **a service instance is shared by every
request.** Do not keep per-request state on `this`. Anything request-scoped
belongs on the request object, in an argument, or in `AsyncLocalStorage`.

## The request object is not wrapped

A controller receives the request and reply directly. Lugh does not build a
context object, does not copy properties onto a facade, and does not narrow what
you can reach.

The alternative, a `ctx` per request, reads nicely in a tutorial and costs an
allocation on every call, forever. Worse, it decides in advance which
capabilities you are allowed: the day you need to stream a response or take over
the socket, you are fighting the abstraction that was supposed to help.

`LughRequest` and `LughReply` are exported from `@lughjs/core` so application
code has one import to remember, but they are the real objects, passed through.

## Injection matches parameter names

The container runs on constructor parameter names. `postService` resolves the
class in `app/services/post_service.ts`.

The alternative is decorators plus metadata reflection. That would mean a
TypeScript-only framework, a compiler flag, and a runtime dependency doing work
during construction. Parameter matching costs nothing at runtime and is why
`lugh new --language=js` produces a project with the same container, the same
generators and no build step.

The price is real and worth stating: **a parameter name is load-bearing.**
Rename it and resolution breaks: the type annotation is not what is matched.
Lugh compensates by failing loudly: an unregistered key names the key it looked
for, two files claiming one key is a boot error, and a file that would shadow
`db`, `config` or `env` is refused.

## Routes are declared inside a function

`start/routes` default-exports a function. It would be prettier to call
`Route.get(...)` at the top of the module, and that is exactly what an earlier
version did.

It does not work. A module body is evaluated once per process, so the second
boot in one process (a test, a benchmark, a reload) would find the registrar
reset and the module cached, and register nothing at all. Silently. The earlier
version papered over this by appending a changing query string to every import,
which meant the module map grew forever and two boots inside the same
millisecond quietly shared a stale copy.

A function is called every time. The problem disappears instead of being
managed.

## A 500 never says what went wrong

Error responses carry a generic message for any 5xx, in every environment.
Detail goes into separate fields, and only outside production.

This is not caution for its own sake. Database drivers put the failing statement
*and the values bound into it* in the error message. Passing that through
answers an anonymous request with your table names, your column names, your
constraints and a row of real data. The rule is absolute so that no handler,
logger or client that reads only `message` can ever leak internals by accident.

A deliberate 4xx keeps its message. That is the entire point of throwing one.

## Response schemas are an allow-list

Declaring `response` on a route does two jobs. It moves serialization onto the
fast path, and it means only the listed properties are emitted.

That second property is the one that matters. "Never select the password hash"
is a habit, and habits fail during a refactor. "This route emits `id`, `name`,
`email`" is a fact about the wire format that a `SELECT *` cannot override.

## `fresh` is not `refresh`

`migration:refresh` replays each migration's `down()`. `migration:fresh`
enumerates the schema and drops it.

They used to be the same function, which made `fresh` useless for the one
situation it exists for: a database whose real shape has drifted from its
migration history: a table a `down()` forgot, a table created by hand. `fresh`
now starts from an empty schema, is implemented per database engine, and refuses
an engine it does not know rather than half-dropping your data.

## Configuration is validated before anything is built

`config/env` declares what the app needs. A missing or malformed variable throws
during boot, naming every variable that failed.

Secrets are declared with **no default**, deliberately. A default on a secret is
the exact mechanism by which a placeholder ends up signing production tokens.
the app works, so nobody looks. Without a default the failure happens at boot,
on the machine that is misconfigured.

`loadEnv` returns a plain object rather than a strict proxy, so reading a key
you did not declare gives `undefined` instead of throwing. Validation should
catch configuration mistakes, not turn an ordinary property lookup into a crash.

## Middleware is told apart by its default export

`app/middleware` holds two kinds of file, and the distinction is mechanical: a
module with a default-exported function is global middleware and Lugh invokes it
with the server; a module without one is left alone.

That second case is the convention for per-route guards like `auth.ts`, which
`start/routes` imports by name. A default export that exists but is not callable
is an error, because it is always a mistake.

Files load in sorted order, which is why the generated ones are numbered
`005_`, `010_`, `020_`. The number *is* the ordering mechanism: schemas must be
registered before the routes that reference them.

## Your project runs without a build step

The CLI registers a loader before it imports anything from your project, so
`.ts` config, migrations, routes, controllers and services run directly. There
is no build pipeline to configure, no `dist/` to keep in sync, and no class of
bug where the source and the running code disagree. `--language=js` skips the
transform entirely.

The framework itself is the exception, and deliberately so. `@lughjs/core` is
published as compiled JavaScript with type declarations beside it. Node refuses
to strip types from anything inside `node_modules`, so a package that shipped
`.ts` could only ever be loaded through a loader: `node your-server.js` would
fail, and so would any test runner, bundler or deployment that did not opt in.
Shipping the build removes that constraint and takes the transform of the
framework's own several thousand lines off every cold start.

The loader stays a runtime dependency because your project still needs it.

Inside this repository the package resolves to `src/` instead, under the
`lugh-dev` export condition, so the test suite runs against the sources rather
than against a build that may be a rebuild behind them.

## Deliberately absent

No template engine, no session layer, no queue, no mailer, no websockets, no
i18n, no admin panel. Each of those is a library away and none of them needs the
framework to have an opinion. A framework that ships everything is a framework
you cannot leave.
