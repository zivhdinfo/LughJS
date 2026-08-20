import { Command } from 'commander'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  controllerTemplate,
  migrationTemplate,
  modelTemplate,
  pluralize,
  seederTemplate,
  serviceTemplate,
  snakeCase,
  timestamp,
  writeIfAbsent,
  type Language,
} from './generators.js'
import {
  resolveOptions,
  scaffoldProject,
  type DatabaseChoice,
  type ScaffoldOptions,
} from './scaffold.js'
import {
  createDatabase,
  freshMigrations,
  migrationStatus,
  refreshMigrations,
  resetMigrations,
  rollbackMigrations,
  runMigrations,
  runSeeders,
  type MigrationResult,
} from './database.js'
import type { Knex } from 'knex'

// Read from package.json rather than duplicating the number: `src/cli.ts` and
// `dist/cli.js` are both one directory below the manifest, so one path works
// for the compiled build and for a source run.
const VERSION = (createRequire(import.meta.url)('../package.json') as { version: string }).version

// ─────────────────────────────────────────────────────────────────────────────
// project helpers
// ─────────────────────────────────────────────────────────────────────────────

/** A project is TypeScript if its config files are `.ts`. */
export function detectLanguage(root: string): Language {
  return fs.existsSync(path.join(root, 'config', 'app.ts')) ? 'ts' : 'js'
}

function resolveProjectFile(root: string, ...segments: string[]): string {
  const base = path.join(root, ...segments)
  for (const e of ['.ts', '.js', '.mjs']) {
    if (fs.existsSync(base + e)) return base + e
  }
  throw new Error(`[lugh] Not a LughJS project: ${base}.ts not found (run this inside your project root)`)
}

async function loadDatabaseConfig(root: string): Promise<Knex.Config> {
  const file = resolveProjectFile(root, 'config', 'database')
  const mod = await import(pathToFileURL(file).href)
  return (mod.default ?? mod) as Knex.Config
}

/** Loads `.env` so the database config sees the project's credentials. */
async function loadDotEnv(root: string): Promise<void> {
  const envFile = path.join(root, '.env')
  if (!fs.existsSync(envFile)) return
  const { config } = await import('dotenv')
  config({ path: envFile })
}

async function withDatabase<T>(root: string, fn: (db: Knex) => Promise<T>): Promise<T> {
  await loadDotEnv(root)
  const db = createDatabase(await loadDatabaseConfig(root))
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

const migrationsDir = (root: string) => path.join(root, 'database', 'migrations')
const seedersDir = (root: string) => path.join(root, 'database', 'seeders')

/**
 * Resolves a `--class` seeder name to exactly one file.
 *
 * A bare substring match is deliberately NOT accepted when it is ambiguous:
 * `--class users` matching both `0001_users.ts` and `0002_users_extra.ts` used
 * to silently run whichever `readdir` returned first.
 */
export function resolveSeederName(name: string, dir: string): string {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(ts|js|mjs)$/.test(f)) : []

  const exact = files.find((f) => f === name || f.replace(/\.(ts|js|mjs)$/, '') === name)
  if (exact) return exact

  const partial = files.filter((f) => f.includes(name))
  if (partial.length === 1) return partial[0] as string
  if (partial.length > 1) {
    throw new Error(`[lugh] Seeder "${name}" is ambiguous, it matches: ${partial.join(', ')}`)
  }
  throw new Error(`[lugh] Seeder "${name}" not found in ${dir}. Available: ${files.join(', ') || '(none)'}`)
}

/** knex's migrator returns `[batchNumber, names]`. */
function logMigrations(title: string, result: MigrationResult): void {
  console.log(`\n${title}`)
  const [batch, names] = result ?? []
  if (!Array.isArray(names) || names.length === 0) {
    console.log('  nothing to do')
    return
  }
  console.log(`  batch ${batch}`)
  for (const name of names) console.log(`  - ${name}`)
}

export function findServerEntry(root: string): string {
  const candidates = [
    path.join(root, 'start', 'server.ts'),
    path.join(root, 'start', 'server.js'),
    path.join(root, 'src', 'server.ts'),
    path.join(root, 'server.ts'),
    path.join(root, 'server.js'),
  ]
  const found = candidates.find((c) => fs.existsSync(c))
  if (!found) throw new Error('[lugh] No server entry found (looked for start/server.ts, start/server.js, server.ts)')
  return found
}

/**
 * Runs the server as a child process and forwards termination signals so the
 * app's own graceful-shutdown handlers get a chance to run. Without forwarding,
 * Ctrl+C killed the CLI and orphaned the server.
 */
function runServer(target: string, watch: boolean): void {
  const args = watch ? ['--watch', '--import', 'tsx', target] : ['--import', 'tsx', target]
  const child = spawn(process.execPath, args, { stdio: 'inherit' })

  const forward = (signal: NodeJS.Signals) => () => {
    if (!child.killed) child.kill(signal)
  }
  const onInt = forward('SIGINT')
  const onTerm = forward('SIGTERM')
  process.on('SIGINT', onInt)
  process.on('SIGTERM', onTerm)

  child.on('exit', (code, signal) => {
    process.off('SIGINT', onInt)
    process.off('SIGTERM', onTerm)
    // 128+n is the conventional exit status for "terminated by signal n".
    process.exit(signal ? 128 + (SIGNALS[signal] ?? 0) : (code ?? 0))
  })
}

const SIGNALS: Record<string, number> = { SIGINT: 2, SIGTERM: 15, SIGHUP: 1 }

function reportCreated(file: string, status: 'created' | 'exists'): void {
  console.log(status === 'created' ? `CREATE ${file}` : `SKIP   ${file} (already exists)`)
}

// ─────────────────────────────────────────────────────────────────────────────
// program
// ─────────────────────────────────────────────────────────────────────────────

export async function main(argv: string[]): Promise<void> {
  const root = process.cwd()
  const program = new Command()
    .name('lugh')
    .description('Structure, a container and a database layer for Node HTTP services')
    .version(VERSION)
    .showHelpAfterError()

  // ── scaffolding a whole project ──
  program
    .command('new [name]')
    .description('Create a new LughJS project')
    .option('-l, --language <language>', 'ts | js')
    .option('-d, --database <database>', 'sqlite | postgres | mysql')
    .option('--auth', 'include the auth scaffold (JWT + bcrypt + users table)')
    .option('--no-auth', 'skip the auth scaffold')
    .option('-y, --yes', 'accept defaults, do not prompt')
    .action(async (name: string | undefined, opts: Record<string, unknown>) => {
      const partial: Partial<ScaffoldOptions> = {}
      if (name !== undefined) partial.name = name
      if (opts.language !== undefined) partial.language = assertChoice('language', opts.language as string, ['ts', 'js']) as Language
      if (opts.database !== undefined) {
        partial.database = assertChoice('database', opts.database as string, ['sqlite', 'postgres', 'mysql']) as DatabaseChoice
      }
      // commander sets `auth` to false for --no-auth and true for --auth; it is
      // left undefined only when neither flag was given, which is what we want
      // the prompt to distinguish.
      if (argv.includes('--auth') || argv.includes('--no-auth')) partial.auth = opts.auth as boolean
      if (opts.yes) {
        partial.name ??= 'my-app'
        partial.language ??= 'ts'
        partial.database ??= 'sqlite'
        partial.auth ??= false
      }

      const resolved = await resolveOptions(partial, { interactive: !opts.yes })
      const result = scaffoldProject(root, resolved)

      console.log(`\nCreated ${result.options.name} (${result.options.language}, ${result.options.database}${result.options.auth ? ', auth' : ''})`)
      for (const f of result.files) console.log(`  ${f}`)
      console.log(`\nNext:\n  cd ${result.options.name}\n  npm install\n  npm run migrate\n  npm run dev\n`)
    })

  // ── file generators ──
  program
    .command('make:controller <name>')
    .description('Create a controller in app/controllers')
    .action((name: string) => {
      const lang = detectLanguage(root)
      const file = path.join(root, 'app', 'controllers', `${snakeCase(name)}_controller.${lang}`)
      reportCreated(file, writeIfAbsent(file, controllerTemplate(name, lang)))
    })

  program
    .command('make:model <name>')
    .description('Create a model in app/models')
    .action((name: string) => {
      const lang = detectLanguage(root)
      const file = path.join(root, 'app', 'models', `${snakeCase(name)}.${lang}`)
      reportCreated(file, writeIfAbsent(file, modelTemplate(name, lang)))
    })

  program
    .command('make:service <name>')
    .description('Create a service in app/services')
    .action((name: string) => {
      const lang = detectLanguage(root)
      const file = path.join(root, 'app', 'services', `${snakeCase(name)}_service.${lang}`)
      reportCreated(file, writeIfAbsent(file, serviceTemplate(name, lang)))
    })

  program
    .command('make:migration <name>')
    .description('Create a migration in database/migrations')
    .action((name: string) => {
      const lang = detectLanguage(root)
      const file = path.join(root, 'database', 'migrations', `${timestamp()}_${snakeCase(name)}.${lang}`)
      reportCreated(file, writeIfAbsent(file, migrationTemplate(name, lang)))
    })

  program
    .command('make:seeder <name>')
    .description('Create a seeder in database/seeders')
    .action((name: string) => {
      const lang = detectLanguage(root)
      const file = path.join(root, 'database', 'seeders', `${timestamp()}_${snakeCase(name)}.${lang}`)
      reportCreated(file, writeIfAbsent(file, seederTemplate(name, lang)))
    })

  // ── migrations ──
  program
    .command('migration:run')
    .description('Run all pending migrations')
    .action(async () => {
      await withDatabase(root, async (db) => {
        logMigrations('migration:run', await runMigrations(db, migrationsDir(root)))
      })
    })

  program
    .command('migration:rollback')
    .description('Roll back the last batch of migrations')
    .option('-a, --all', 'roll back all migrations', false)
    .action(async (opts: { all?: boolean }) => {
      await withDatabase(root, async (db) => {
        logMigrations('migration:rollback', await rollbackMigrations(db, migrationsDir(root), opts.all ?? false))
      })
    })

  program
    .command('migration:refresh')
    .description('Roll back all migrations, then re-run them')
    .action(async () => {
      await withDatabase(root, async (db) => {
        logMigrations('migration:refresh', await refreshMigrations(db, migrationsDir(root)))
      })
    })

  program
    .command('migration:reset')
    .description('Roll back all migrations without re-running')
    .action(async () => {
      await withDatabase(root, async (db) => {
        logMigrations('migration:reset', await resetMigrations(db, migrationsDir(root)))
      })
    })

  program
    .command('migration:fresh')
    .description('DROP every table in the schema, then re-run all migrations')
    .action(async () => {
      await withDatabase(root, async (db) => {
        logMigrations('migration:fresh', await freshMigrations(db, migrationsDir(root)))
      })
    })

  program
    .command('migration:status')
    .description('List all migrations with their status')
    .action(async () => {
      await withDatabase(root, async (db) => {
        const entries = await migrationStatus(db, migrationsDir(root))
        console.log('\nmigration:status')
        if (entries.length === 0) {
          console.log('  (no migrations found)')
          return
        }
        for (const e of entries) {
          const marker = e.status === 'completed' ? '✓' : '·'
          const batch = e.batch !== null ? `batch ${e.batch}` : 'pending'
          console.log(`  ${marker} ${e.name}  (${batch}${e.migrationTime ? `, ${e.migrationTime}` : ''})`)
        }
      })
    })

  program
    .command('db:seed')
    .description('Run the database seeders')
    .option('-c, --class <name>', 'run only this seeder (file name, with or without extension)')
    .action(async (opts: { class?: string }) => {
      await withDatabase(root, async (db) => {
        const specific = opts.class ? resolveSeederName(opts.class, seedersDir(root)) : undefined
        await runSeeders(db, seedersDir(root), specific)
        console.log(`\ndb:seed completed${specific ? ` (${specific})` : ''}`)
      })
    })

  // ── running ──
  program
    .command('serve [entry]')
    .description('Start the HTTP server')
    .action((entry?: string) => runServer(entry ?? findServerEntry(root), false))

  program
    .command('dev [entry]')
    .description('Start the HTTP server with watch/reload')
    .action((entry?: string) => runServer(entry ?? findServerEntry(root), true))

  program
    .command('list:routes')
    .description('List all registered routes')
    .action(async () => {
      await loadDotEnv(root)
      const { createApp } = await import('./app.js')
      const { server, db } = await createApp(root)
      try {
        console.log(server.printRoutes())
      } finally {
        await server.close()
        await db.destroy()
      }
    })

  await program.parseAsync([process.argv[0] as string, 'lugh', ...argv])
}

function assertChoice(flag: string, value: string, allowed: string[]): string {
  if (!allowed.includes(value)) {
    throw new Error(`[lugh] --${flag} must be one of: ${allowed.join(', ')} (got "${value}")`)
  }
  return value
}

export { pluralize }
