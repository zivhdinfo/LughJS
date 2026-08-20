#!/usr/bin/env node
// LughJS CLI shim: registers the tsx loader, then runs the TypeScript CLI.
import { register } from 'tsx/esm/api'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

register()

const require = createRequire(import.meta.url)
const cliPath = pathToFileURL(require.resolve('../src/cli.ts')).href

try {
  const { main } = await import(cliPath)
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
