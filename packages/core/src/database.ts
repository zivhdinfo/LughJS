import knex, { type Knex } from 'knex'
import { Model } from 'objection'

/**
 * Creates a Knex instance from the app's database config and binds it to
 * Objection's Model base class so models share the same connection.
 *
 * `Model.knex()` is global to the Objection package: a second `createDatabase`
 * call in the same process rebinds every model. That is fine for the normal
 * one-app-per-process case, and tests that need two connections should pass an
 * explicit `.connection()` per query.
 */
export function createDatabase(config: Knex.Config): Knex {
  const db = knex(config)
  Model.knex(db)
  return db
}

/** knex's migrator returns `[batchNumber, migrationNames]`. */
export type MigrationResult = [batch: number, names: string[]]

export interface MigrationStatusEntry {
  name: string
  batch: number | null
  migrationTime: string | null
  status: 'completed' | 'pending'
}

function dirOpts(directory?: string): Knex.MigratorConfig | undefined {
  return directory ? { directory } : undefined
}

/** The migrations table this connection is configured to use. */
function migrationsTable(db: Knex): string {
  const cfg = (db.client?.config ?? {}) as Knex.Config
  return cfg.migrations?.tableName ?? 'knex_migrations'
}

/** Runs all pending migrations (knex migrate:latest). */
export async function runMigrations(db: Knex, directory?: string): Promise<MigrationResult> {
  return (await db.migrate.latest(dirOpts(directory))) as unknown as MigrationResult
}

/** Rolls back the last batch of migrations (knex migrate:rollback). */
export async function rollbackMigrations(db: Knex, directory?: string, all = false): Promise<MigrationResult> {
  return (await db.migrate.rollback(dirOpts(directory), all)) as unknown as MigrationResult
}

/** Rolls back ALL migrations, then re-runs everything (knex migrate:refresh). */
export async function refreshMigrations(db: Knex, directory?: string): Promise<MigrationResult> {
  await db.migrate.rollback(dirOpts(directory), true)
  return runMigrations(db, directory)
}

/** Rolls back ALL migrations without re-running (knex migrate:reset). */
export async function resetMigrations(db: Knex, directory?: string): Promise<MigrationResult> {
  return rollbackMigrations(db, directory, true)
}

/**
 * DROPS every table in the current schema, then re-runs all migrations.
 *
 * This is what distinguishes `fresh` from `refresh`: `refresh` only replays the
 * `down()` of each migration, so anything a migration forgot to drop, or a
 * table created outside the migration history, survives. `fresh` starts from a
 * genuinely empty schema.
 */
export async function freshMigrations(db: Knex, directory?: string): Promise<MigrationResult> {
  await dropAllTables(db)
  return runMigrations(db, directory)
}

/** Lists the tables in the current schema, excluding driver-internal ones. */
export async function listTables(db: Knex): Promise<string[]> {
  const dialect = db.client.dialect as string
  if (dialect === 'sqlite3') {
    const rows = await db
      .select('name')
      .from('sqlite_master')
      .where('type', 'table')
      .whereRaw("name not like 'sqlite_%'")
    return rows.map((r: { name: string }) => r.name)
  }
  if (dialect === 'postgresql' || dialect === 'redshift') {
    const rows = await db
      .select('tablename as name')
      .from('pg_tables')
      .whereRaw('schemaname = current_schema()')
    return rows.map((r: { name: string }) => r.name)
  }
  if (dialect === 'mysql' || dialect === 'mariadb') {
    const rows = await db
      .select('table_name as name')
      .from('information_schema.tables')
      .whereRaw('table_schema = database()')
      .andWhere('table_type', 'BASE TABLE')
    return rows.map((r: { name: string }) => r.name)
  }
  throw new Error(`[lugh] migration:fresh does not support the "${dialect}" dialect yet`)
}

/** Drops every table in the current schema, ignoring foreign-key ordering. */
export async function dropAllTables(db: Knex): Promise<string[]> {
  const tables = await listTables(db)
  if (tables.length === 0) return []
  const dialect = db.client.dialect as string

  if (dialect === 'postgresql' || dialect === 'redshift') {
    const list = tables.map((t) => `"${t}"`).join(', ')
    await db.raw(`drop table if exists ${list} cascade`)
    return tables
  }
  if (dialect === 'mysql' || dialect === 'mariadb') {
    await db.raw('set foreign_key_checks = 0')
    try {
      const list = tables.map((t) => `\`${t}\``).join(', ')
      await db.raw(`drop table if exists ${list}`)
    } finally {
      await db.raw('set foreign_key_checks = 1')
    }
    return tables
  }
  // sqlite: no cascade, so drop with FK enforcement off
  await db.raw('pragma foreign_keys = OFF')
  try {
    for (const t of tables) await db.schema.dropTableIfExists(t)
  } finally {
    await db.raw('pragma foreign_keys = ON')
  }
  return tables
}

/**
 * Lists every migration with its status (completed batch + time, or pending).
 * Mirrors knex migrate:status.
 */
export async function migrationStatus(db: Knex, directory?: string): Promise<MigrationStatusEntry[]> {
  const [, pending] = (await db.migrate.list(dirOpts(directory))) as unknown as [
    Array<{ name: string } | string>,
    Array<{ file: string } | string>,
  ]

  const entries = new Map<string, MigrationStatusEntry>()

  const table = migrationsTable(db)
  if (await db.schema.hasTable(table)) {
    const completed = await db(table).select('name', 'batch', 'migration_time').orderBy('name')
    for (const row of completed) {
      entries.set(row.name, {
        name: row.name,
        batch: Number(row.batch),
        migrationTime: row.migration_time ? String(row.migration_time) : null,
        status: 'completed',
      })
    }
  }

  // knex reports pending entries as `{ file, directory }` objects on some
  // versions and as bare strings on others.
  for (const p of pending) {
    const name = typeof p === 'string' ? p : p.file
    if (entries.has(name)) continue
    entries.set(name, { name, batch: null, migrationTime: null, status: 'pending' })
  }

  return [...entries.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/** Runs the database seeders (knex seed:run). Optionally only one file. */
export async function runSeeders(db: Knex, directory?: string, specific?: string): Promise<unknown> {
  const config: Knex.SeederConfig = {}
  if (directory) config.directory = directory
  if (specific) config.specific = specific
  return db.seed.run(Object.keys(config).length > 0 ? config : undefined)
}
