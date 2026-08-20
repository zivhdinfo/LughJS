import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDatabase, runMigrations, rollbackMigrations, freshMigrations, runSeeders } from '../src/database.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(here, 'fixtures', 'app', 'database', 'migrations')
const seedersDir = path.join(here, 'fixtures', 'app', 'database', 'seeders')

test('migration:run creates tables, rollback drops them, fresh re-runs', async () => {
  const db = createDatabase({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
  })
  try {
    await runMigrations(db, migrationsDir)
    assert.equal(await db.schema.hasTable('posts'), true)
    assert.equal(await db.schema.hasTable('knex_migrations'), true)

    await rollbackMigrations(db, migrationsDir)
    assert.equal(await db.schema.hasTable('posts'), false)

    await freshMigrations(db, migrationsDir)
    assert.equal(await db.schema.hasTable('posts'), true)
  } finally {
    await db.destroy()
  }
})

test('seeders insert rows into migrated tables', async () => {
  const db = createDatabase({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
  })
  try {
    await runMigrations(db, migrationsDir)
    await runSeeders(db, seedersDir)
    const rows = await db('posts').select('id', 'title')
    assert.ok(rows.length >= 1, 'seeder inserted rows')
    assert.ok(rows.some((r: { title: string }) => r.title.includes('seeded')))
  } finally {
    await db.destroy()
  }
})
