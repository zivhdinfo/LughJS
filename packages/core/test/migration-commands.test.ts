import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  createDatabase,
  runMigrations,
  rollbackMigrations,
  refreshMigrations,
  resetMigrations,
  freshMigrations,
  migrationStatus,
  runSeeders,
} from '../src/database.js'
import type { Knex } from 'knex'

const here = path.dirname(fileURLToPath(import.meta.url))

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lugh-mig-'))
}

function makeDb(dir: string): Knex {
  return createDatabase({
    client: 'better-sqlite3',
    connection: { filename: path.join(dir, 'test.sqlite') },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
  })
}

function writeMigration(dir: string, name: string, up: string, down: string): void {
  fs.writeFileSync(
    path.join(dir, name),
    `import type { Knex } from 'knex'\nexport async function up(knex: Knex): Promise<void> { ${up} }\nexport async function down(knex: Knex): Promise<void> { ${down} }\n`,
    'utf8',
  )
}

test('migration:status reports completed and pending accurately', async () => {
  const dir = tempDir()
  fs.mkdirSync(path.join(dir, 'migrations'), { recursive: true })
  writeMigration(
    path.join(dir, 'migrations'),
    '001_create_a.ts',
    'await knex.schema.createTable("a", (t) => { t.increments("id") })',
    'await knex.schema.dropTableIfExists("a")',
  )
  writeMigration(
    path.join(dir, 'migrations'),
    '002_create_b.ts',
    'await knex.schema.createTable("b", (t) => { t.increments("id") })',
    'await knex.schema.dropTableIfExists("b")',
  )

  const db = makeDb(dir)
  try {
    // nothing run yet → both pending
    let status = await migrationStatus(db, path.join(dir, 'migrations'))
    assert.equal(status.length, 2)
    assert.ok(status.every((e) => e.status === 'pending'))

    await runMigrations(db, path.join(dir, 'migrations'))
    status = await migrationStatus(db, path.join(dir, 'migrations'))
    assert.ok(status.every((e) => e.status === 'completed'))
    assert.ok(status.every((e) => e.batch === 1))

    // rollback last batch → both pending again (single batch)
    await rollbackMigrations(db, path.join(dir, 'migrations'))
    status = await migrationStatus(db, path.join(dir, 'migrations'))
    assert.ok(status.every((e) => e.status === 'pending'))
  } finally {
    await db.destroy()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('migration:refresh rolls back ALL then re-runs (down paths on real data)', async () => {
  const dir = tempDir()
  fs.mkdirSync(path.join(dir, 'migrations'), { recursive: true })
  writeMigration(
    path.join(dir, 'migrations'),
    '001_create_a.ts',
    'await knex.schema.createTable("a", (t) => { t.increments("id"); t.string("name") })',
    'await knex.schema.dropTableIfExists("a")',
  )
  const db = makeDb(dir)
  try {
    await runMigrations(db, path.join(dir, 'migrations'))
    // seed real data, then refresh → down runs against seeded table
    await db('a').insert({ name: 'seeded-row' })
    assert.equal((await db('a').count<{ c: number }>('id as c').first())?.c, 1)

    await refreshMigrations(db, path.join(dir, 'migrations'))
    assert.equal(await db.schema.hasTable('a'), true)
    // data is gone after down+up
    assert.equal((await db('a').count<{ c: number }>('id as c').first())?.c, 0)
    const status = await migrationStatus(db, path.join(dir, 'migrations'))
    assert.ok(status.every((e) => e.status === 'completed'))
  } finally {
    await db.destroy()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('migration:reset rolls back all and leaves schema empty', async () => {
  const dir = tempDir()
  fs.mkdirSync(path.join(dir, 'migrations'), { recursive: true })
  writeMigration(
    path.join(dir, 'migrations'),
    '001_create_a.ts',
    'await knex.schema.createTable("a", (t) => { t.increments("id") })',
    'await knex.schema.dropTableIfExists("a")',
  )
  const db = makeDb(dir)
  try {
    await runMigrations(db, path.join(dir, 'migrations'))
    await resetMigrations(db, path.join(dir, 'migrations'))
    assert.equal(await db.schema.hasTable('a'), false)
    const status = await migrationStatus(db, path.join(dir, 'migrations'))
    assert.ok(status.every((e) => e.status === 'pending'))
  } finally {
    await db.destroy()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a migration that throws mid-batch rolls back in a transaction', async () => {
  const dir = tempDir()
  fs.mkdirSync(path.join(dir, 'migrations'), { recursive: true })
  // First migration succeeds, second throws AFTER creating a table.
  writeMigration(
    path.join(dir, 'migrations'),
    '001_good.ts',
    'await knex.schema.createTable("good", (t) => { t.increments("id") })',
    'await knex.schema.dropTableIfExists("good")',
  )
  writeMigration(
    path.join(dir, 'migrations'),
    '002_bad.ts',
    'await knex.schema.createTable("bad", (t) => { t.increments("id") }); throw new Error("boom mid-migration")',
    'await knex.schema.dropTableIfExists("bad")',
  )

  const db = makeDb(dir)
  try {
    await assert.rejects(() => runMigrations(db, path.join(dir, 'migrations')), /boom mid-migration/)
    // The failed batch must have been rolled back: neither table exists.
    assert.equal(await db.schema.hasTable('good'), false, 'first migration of failed batch must roll back')
    assert.equal(await db.schema.hasTable('bad'), false, 'partially created table must roll back')
    // migration:status must report both as pending (batch never committed).
    const status = await migrationStatus(db, path.join(dir, 'migrations'))
    assert.equal(status.length, 2)
    assert.ok(status.every((e) => e.status === 'pending'), 'failed batch must not be marked completed')
  } finally {
    await db.destroy()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('running seeders twice does not duplicate rows', async () => {
  const dir = tempDir()
  fs.mkdirSync(path.join(dir, 'migrations'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'seeders'), { recursive: true })
  writeMigration(
    path.join(dir, 'migrations'),
    '001_create_posts.ts',
    'await knex.schema.createTable("posts", (t) => { t.increments("id"); t.string("title").unique() })',
    'await knex.schema.dropTableIfExists("posts")',
  )
  // Idempotent seeder: clear first, then insert.
  fs.writeFileSync(
    path.join(dir, 'seeders', '001_seed.ts'),
    `import type { Knex } from 'knex'\nexport async function seed(knex: Knex): Promise<void> {\n  await knex('posts').del()\n  await knex('posts').insert([{ title: 'one' }, { title: 'two' }])\n}\n`,
    'utf8',
  )

  const db = makeDb(dir)
  try {
    await runMigrations(db, path.join(dir, 'migrations'))
    await runSeeders(db, path.join(dir, 'seeders'))
    await runSeeders(db, path.join(dir, 'seeders'))
    const rows = await db('posts').select('title')
    assert.equal(rows.length, 2, 'second seed run must not duplicate rows')
  } finally {
    await db.destroy()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('db:seed --class runs only the named seeder', async () => {
  const dir = tempDir()
  fs.mkdirSync(path.join(dir, 'migrations'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'seeders'), { recursive: true })
  writeMigration(
    path.join(dir, 'migrations'),
    '001_create_posts.ts',
    'await knex.schema.createTable("posts", (t) => { t.increments("id"); t.string("title").unique() })',
    'await knex.schema.dropTableIfExists("posts")',
  )
  fs.writeFileSync(
    path.join(dir, 'seeders', '0001_alpha.ts'),
    `import type { Knex } from 'knex'\nexport async function seed(knex: Knex): Promise<void> { await knex('posts').insert([{ title: 'alpha' }]) }\n`,
    'utf8',
  )
  fs.writeFileSync(
    path.join(dir, 'seeders', '0002_beta.ts'),
    `import type { Knex } from 'knex'\nexport async function seed(knex: Knex): Promise<void> { await knex('posts').insert([{ title: 'beta' }]) }\n`,
    'utf8',
  )

  const db = makeDb(dir)
  try {
    await runMigrations(db, path.join(dir, 'migrations'))
    await runSeeders(db, path.join(dir, 'seeders'), '0001_alpha.ts')
    const rows = await db('posts').select('title')
    assert.deepEqual(rows.map((r) => r.title), ['alpha'])
  } finally {
    await db.destroy()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('fresh drops everything and re-runs', async () => {
  const dir = tempDir()
  fs.mkdirSync(path.join(dir, 'migrations'), { recursive: true })
  writeMigration(
    path.join(dir, 'migrations'),
    '001_create_a.ts',
    'await knex.schema.createTable("a", (t) => { t.increments("id") })',
    'await knex.schema.dropTableIfExists("a")',
  )
  const db = makeDb(dir)
  try {
    await runMigrations(db, path.join(dir, 'migrations'))
    await db('a').insert({})
    await freshMigrations(db, path.join(dir, 'migrations'))
    assert.equal(await db.schema.hasTable('a'), true)
    assert.equal((await db('a').count<{ c: number }>('id as c').first())?.c, 0)
  } finally {
    await db.destroy()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
