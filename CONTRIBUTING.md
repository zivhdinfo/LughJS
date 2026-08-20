# Contributing

Thanks for taking the time. This is a small repository and the setup is short.

## Local setup

```bash
git clone https://github.com/zivhdinfo/LughJS.git
cd LughJS
npm ci
```

`npm ci` builds `packages/core` as part of its `prepare` step. Node.js 22 or
newer is required.

### How `@lughjs/core` resolves

`@lughjs/core` is published as compiled JavaScript in `dist/`, so consumers can
import it with plain `node`. Two consumers inside this repository resolve it
that way too: `apps/demo` and `bench` both load the build, which means a change
to the framework reaches them only after `npm run build --workspace
@lughjs/core`.

The core test suite is the exception. It runs with `--conditions=lugh-dev`,
which the package's `exports` map points at `src/`, so tests exercise the
sources directly and need no rebuild.

Keep the two apart. `Route` is a module-global registrar, and a process that
loaded `src/` and `dist/` at the same time would collect two separate route
tables and register neither properly.

## Layout

```
packages/core   @lughjs/core, the framework and the CLI
apps/demo       a reference application, not published
bench           the measurement harness, not published
docs            documentation
```

`apps/demo` and `bench` both resolve `@lughjs/core` through the workspace, so a
change to the framework is visible to them after a rebuild.

## The checks CI runs

Run these before opening a pull request. They are the same four steps as
[.github/workflows/ci.yml](.github/workflows/ci.yml).

```bash
npm run build --workspace @lughjs/core
npm run typecheck --workspace @lughjs/core
npm run typecheck --workspace @lughjs/demo
npx tsc -p bench/tsconfig.json
npm test
npm audit --omit=dev
```

`npm test` runs the core suite and the benchmark fixture suite.

## Tests

Tests use `node:test` and live in `packages/core/test`. They run against real
code: a real boot through `createApp`, real SQLite migrations, a real child
process for the shutdown test, and a real `tsc` invocation to prove the
scaffolded project typechecks.

A change to behaviour needs a test that fails without it. Two conventions worth
knowing:

- `test/hardening.test.ts` holds the guarantees stated in
  [SECURITY.md](SECURITY.md). Treat a change there as a change to the contract.
- `test/regressions.test.ts` holds one test per fixed bug, each naming the bug.
  Add to it rather than to the general suites.

## The benchmark fixture

`bench/fixtures/fortunes.ts` is generated from a pinned, verbatim download of
the TechEmpower dataset, and `bench/test/fortunes.test.ts` checks it against
pinned SHA-256 hashes. Do not hand-edit either file. If upstream legitimately
changes, regenerate the fixture and update the hashes in the same commit, with
the reason in the message.

Two rows in that fixture contain an em dash. They are upstream data, and they
are the one place in the repository where the character is intentional.

## Style

There is no linter configured. Match the surrounding code:

- two-space indentation, no semicolons, single quotes
- explicit return types on exported functions
- comments explain why, not what, and are written in prose

## Documentation

`docs/` is part of the deliverable. A change to behaviour that contradicts a
document is not finished until the document is updated too.

## Commits and pull requests

Describe what changed and why. If it fixes a bug, say what the bug did. Keep
unrelated changes in separate pull requests.
