# Lugh documentation

Start with [Getting started](getting-started.md). The rest can be read in any
order.

## Guides

| Guide | What it covers |
|---|---|
| [Getting started](getting-started.md) | Install, scaffold a project, first request, where the pieces live |
| [Project structure](project-structure.md) | Every folder, what the framework scans, and the exact boot order |
| [Routing](routing.md) | The route table, groups, resources, schemas, per-route guards |
| [Controllers, services and DI](controllers-and-di.md) | How injection resolves, and why it costs nothing per request |
| [Database](database.md) | Knex and Objection, models, relations, migrations, seeders |
| [Configuration](configuration.md) | `config/env`, `config/app`, `config/database`, and validation at boot |
| [Security](security.md) | Error responses, response allow-lists, the auth scaffold, what is left to you |
| [Deployment](deployment.md) | Environment, process management, containers, health checks, shutdown |
| [CLI reference](cli.md) | Every command and every flag |
| [Design notes](design-notes.md) | Why the framework works the way it does |
| [Testing and measurements](testing-and-measurements.md) | The test suite, the benchmark method, and what the numbers say |

## If you are looking for

**How a request is served.** [Routing](routing.md) for the table,
[Controllers, services and DI](controllers-and-di.md) for what the handler is by
the time a request arrives.

**Why my app will not boot.** [Configuration](configuration.md). A missing
environment variable, a container key claimed twice, a route pointing at a
controller that is not there and a schema that will not compile all fail at
boot, on purpose.

**How to keep a column out of a response.**
[Security](security.md#response-schemas-as-an-allow-list). Declare a `response`
schema and the serializer emits only what you listed.

**What to set before going live.**
[Deployment](deployment.md) and the checklist at the end of
[Security](security.md#checklist-before-going-to-production).

**Whether the numbers can be trusted.**
[Testing and measurements](testing-and-measurements.md), which describes how the
harness tries to catch itself out, and [../bench/BENCHMARKS.md](../bench/BENCHMARKS.md)
for the last recorded run.

## Reference application

`apps/demo` in the repository is a working application built on the framework:
posts and users with a relation, JWT auth, ownership checks on writes, response
schemas on every route, and the security middleware wired up. It is the place to
look when a guide describes a pattern and you want to see it in one piece.
