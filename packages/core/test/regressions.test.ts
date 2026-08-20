// Regression tests for defects found in the pre-2.0 audit. Each one fails
// against the old implementation.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import knexFactory from 'knex'
import { toCamelCase, buildContainer, registerFolder } from '../src/container.js'
import { RouteRegistrar } from '../src/router.js'
import { freshMigrations, refreshMigrations, runMigrations, listTables } from '../src/database.js'
import { pluralize, tableFromMigrationName, timestamp, assertGeneratableName } from '../src/generators.js'
import { resolveSeederName } from '../src/cli.js'

function tmpdir(prefix = 'lugh-reg-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

// ── container keys ───────────────────────────────────────────────────────────

test('toCamelCase maps a file name and its class name to the SAME key', () => {
  const pairs: Array<[string, string]> = [
    ['posts_controller', 'PostsController'],
    ['api_controller', 'APIController'],
    ['http_client_service', 'HTTPClientService'],
    ['o_auth_service', 'OAuthService'],
  ]
  for (const [file, cls] of pairs) {
    assert.equal(
      toCamelCase(file),
      toCamelCase(cls),
      `"${file}" and "${cls}" must resolve to one container key, got "${toCamelCase(file)}" vs "${toCamelCase(cls)}"`,
    )
  }
  assert.equal(toCamelCase('APIController'), 'apiController')
  assert.equal(toCamelCase('PostsController'), 'postsController')
})

test('registerFolder rejects a key that collides with an existing registration', async () => {
  const dir = tmpdir()
  const a = path.join(dir, 'app', 'services')
  fs.mkdirSync(a, { recursive: true })
  // `posts_service` and `PostsService` both map to `postsService`.
  fs.writeFileSync(path.join(a, 'posts_service.mjs'), 'export default class PostsService {}\n')
  fs.writeFileSync(path.join(a, 'PostsService.mjs'), 'export default class PostsService {}\n')

  const container = buildContainer({ db: {}, config: {}, env: {} })
  await assert.rejects(() => registerFolder(container, a), /already registered/)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('registerFolder rejects a module that shadows a framework key', async () => {
  const dir = tmpdir()
  const a = path.join(dir, 'app', 'services')
  fs.mkdirSync(a, { recursive: true })
  fs.writeFileSync(path.join(a, 'db.mjs'), 'export default class Db {}\n')

  const container = buildContainer({ db: {}, config: {}, env: {} })
  await assert.rejects(() => registerFolder(container, a), /reserved container key/)
  fs.rmSync(dir, { recursive: true, force: true })
})

// ── routing ──────────────────────────────────────────────────────────────────

test('Route.group prefixes its children and restores the prefix afterwards', () => {
  const r = new RouteRegistrar()
  r.get('/health', () => null)
  r.group('/api', () => {
    r.get('/posts', () => null)
    r.group('/v2', () => {
      r.get('/posts', () => null)
    })
    r.get('/users', () => null)
  })
  r.get('/metrics', () => null)

  assert.deepEqual(
    r.list().map((x) => x.url),
    ['/health', '/api/posts', '/api/v2/posts', '/api/users', '/metrics'],
  )
})

test('Route.group restores the prefix even when the callback throws', () => {
  const r = new RouteRegistrar()
  assert.throws(() =>
    r.group('/api', () => {
      throw new Error('boom')
    }),
  )
  r.get('/after', () => null)
  assert.deepEqual(
    r.list().map((x) => x.url),
    ['/after'],
  )
})

test('an unknown controller names the missing container key', () => {
  const r = new RouteRegistrar()
  r.get('/x', 'NopeController.index')
  const container = buildContainer({ db: {}, config: {}, env: {} })
  assert.throws(
    () => r.register({ route: () => undefined } as never, container),
    /nopeController/,
    'the error must name the key it looked for',
  )
})

// ── migrations ───────────────────────────────────────────────────────────────

const MIGRATION = `import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('owned', (t) => { t.increments('id') })
}
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('owned')
}
`

async function withSqlite<T>(fn: (db: ReturnType<typeof knexFactory>, dir: string) => Promise<T>): Promise<T> {
  const dir = tmpdir('lugh-mig-')
  const migrations = path.join(dir, 'migrations')
  fs.mkdirSync(migrations, { recursive: true })
  fs.writeFileSync(path.join(migrations, '001_owned.ts'), MIGRATION)

  const db = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: path.join(dir, 'test.sqlite') },
    useNullAsDefault: true,
  })
  try {
    return await fn(db, migrations)
  } finally {
    await db.destroy()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('migration:fresh drops tables no migration owns; refresh does not', async () => {
  await withSqlite(async (db, migrations) => {
    const applied = await runMigrations(db, migrations)
    assert.deepEqual(applied[1], ['001_owned.ts'], 'the fixture migration must actually run')
    // A table created outside the migration history, which is exactly what `fresh` is
    // supposed to clear and `refresh` is not.
    await db.schema.createTable('orphan', (t) => t.increments('id'))

    await refreshMigrations(db, migrations)
    assert.equal(await db.schema.hasTable('orphan'), true, 'refresh must leave the orphan table alone')

    await freshMigrations(db, migrations)
    assert.equal(await db.schema.hasTable('orphan'), false, 'fresh must drop the orphan table')
    assert.equal(await db.schema.hasTable('owned'), true, 'fresh re-runs the migrations')
  })
})

test('listTables ignores sqlite internal tables', async () => {
  await withSqlite(async (db, migrations) => {
    await runMigrations(db, migrations)
    const tables = await listTables(db)
    assert.ok(tables.includes('owned'))
    assert.equal(
      tables.some((t) => t.startsWith('sqlite_')),
      false,
    )
  })
})

// ── generators ───────────────────────────────────────────────────────────────

test('a migration name keeps table words that merely contain a verb', () => {
  // `create_addresses` used to become `resses`, because the verb regex was global.
  assert.equal(tableFromMigrationName('create_addresses'), 'addresses')
  assert.equal(tableFromMigrationName('create_posts'), 'posts')
  assert.equal(tableFromMigrationName('add_password_hash_to_users'), 'password_hash_to_users')
  assert.equal(tableFromMigrationName('create_widgets_table'), 'widgets')
})

test('pluralize never double-pluralises an already plural name', () => {
  assert.equal(pluralize('post'), 'posts')
  assert.equal(pluralize('posts'), 'posts')
  assert.equal(pluralize('blog_posts'), 'blog_posts')
  assert.equal(pluralize('box'), 'boxes')
  assert.equal(pluralize('category'), 'categories')
})

test('timestamps are unique within the same second', () => {
  const now = new Date(2025, 0, 1, 12, 0, 0)
  const a = timestamp(new Date(now.getTime() + 1))
  const b = timestamp(new Date(now.getTime() + 2))
  assert.notEqual(a, b, 'millisecond resolution keeps two migrations ordered')
  assert.match(a, /^\d{17}$/)
})

test('a name that cannot form a class is rejected up front', () => {
  assert.throws(() => assertGeneratableName('2fa'), /invalid class name/)
  assert.throws(() => assertGeneratableName('---'), /no letters or digits/)
  assert.doesNotThrow(() => assertGeneratableName('BlogPost'))
})

// ── CLI ──────────────────────────────────────────────────────────────────────

test('an ambiguous --class seeder is an error, not a coin flip', () => {
  const dir = tmpdir('lugh-seed-')
  fs.writeFileSync(path.join(dir, '0001_users.ts'), '')
  fs.writeFileSync(path.join(dir, '0002_users_extra.ts'), '')

  assert.throws(() => resolveSeederName('users', dir), /ambiguous/)
  // An exact name still resolves, even though it is a prefix of the other.
  assert.equal(resolveSeederName('0001_users', dir), '0001_users.ts')
  assert.equal(resolveSeederName('users_extra', dir), '0002_users_extra.ts')
  assert.throws(() => resolveSeederName('nope', dir), /not found/)

  fs.rmSync(dir, { recursive: true, force: true })
})
