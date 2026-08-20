#!/usr/bin/env node
// Lugh CLI entry point.
//
// The tsx loader is registered first because the CLI imports files from the
// user's project (config/database.ts, config/app.ts, the route table) and those
// are TypeScript in a TypeScript project. The framework's own code is compiled,
// so the loader only ever pays for project files.
import { register } from 'tsx/esm/api'

register()

// Imported by package name rather than by relative path, so the CLI resolves
// through the same `exports` map the project does. Both then load one copy of
// the framework: `Route` is a module-global registrar, and two copies of it
// would collect two different route tables.
const { main } = await import('@lughjs/core/cli')

try {
  await main(process.argv.slice(2))
} catch (err) {
  // Commander throws on --help/--version; those are not failures.
  if (err?.code === 'commander.helpDisplayed' || err?.code === 'commander.version') {
    process.exit(0)
  }
  console.error(err?.message ?? err)
  // The stack is what you need when a migration or a config file throws.
  if (process.env.LUGH_DEBUG && err?.stack) console.error(err.stack)
  process.exit(1)
}
