import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { assertValidProjectName, resolveOptions, scaffoldProject, type ScaffoldOptions } from '../src/scaffold.js'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const coreRoot = path.join(here, '..')

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lugh-scaffold-'))
}

function read(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

test('scaffolds a TypeScript + sqlite project without auth', () => {
  const cwd = tmpdir()
  const result = scaffoldProject(cwd, { name: 'shop', language: 'ts', database: 'sqlite', auth: false })

  assert.ok(result.files.includes('tsconfig.json'))
  assert.ok(result.files.includes('start/routes.ts'))
  assert.ok(result.files.includes('app/controllers/post_controller.ts'))
  assert.equal(
    result.files.some((f) => f.includes('auth')),
    false,
    'no auth files without --auth',
  )

  const pkg = JSON.parse(read(result.root, 'package.json'))
  assert.equal(pkg.dependencies['better-sqlite3'] !== undefined, true)
  assert.equal(pkg.dependencies.pg, undefined)
  // Everything the generated source imports must be declared, not inherited
  // from a parent node_modules by accident.
  for (const dep of ['@lughjs/core', 'envalid', 'knex']) {
    assert.ok(pkg.dependencies[dep], `${dep} must be declared`)
  }

  fs.rmSync(cwd, { recursive: true, force: true })
})

test('scaffolds a JavaScript project with no .ts files anywhere', () => {
  const cwd = tmpdir()
  const result = scaffoldProject(cwd, { name: 'shop', language: 'js', database: 'sqlite', auth: true })

  assert.equal(
    result.files.some((f) => f.endsWith('.ts')),
    false,
    'a --language js project must not contain TypeScript',
  )
  assert.equal(result.files.includes('tsconfig.json'), false)

  const controller = read(result.root, 'app/controllers/post_controller.js')
  assert.doesNotMatch(controller, /: LughRequest|private readonly/, 'no TS syntax leaked into the JS template')

  fs.rmSync(cwd, { recursive: true, force: true })
})

test('each database choice selects its own driver and config', () => {
  for (const [database, driver, client] of [
    ['sqlite', 'better-sqlite3', 'better-sqlite3'],
    ['postgres', 'pg', 'pg'],
    ['mysql', 'mysql2', 'mysql2'],
  ] as const) {
    const cwd = tmpdir()
    const result = scaffoldProject(cwd, { name: 'shop', language: 'ts', database, auth: false })
    const pkg = JSON.parse(read(result.root, 'package.json'))
    assert.ok(pkg.dependencies[driver], `${database} must depend on ${driver}`)
    assert.match(read(result.root, 'config/database.ts'), new RegExp(`client: '${client}'`))
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

test('the auth scaffold ships a generated secret and never defaults it', () => {
  const cwd = tmpdir()
  const result = scaffoldProject(cwd, { name: 'shop', language: 'ts', database: 'sqlite', auth: true })

  for (const f of ['app/controllers/auth_controller.ts', 'app/services/auth_service.ts', 'app/middleware/auth.ts']) {
    assert.ok(result.files.includes(f), `${f} must be generated`)
  }

  // JWT_SECRET is declared with no default, so a missing value fails the boot.
  assert.match(read(result.root, 'config/env.ts'), /JWT_SECRET: str\(\),/)

  const env = read(result.root, '.env')
  const secret = /^JWT_SECRET=(.+)$/m.exec(env)?.[1] ?? ''
  assert.ok(secret.length >= 32, 'a real random secret is written to .env')
  assert.doesNotMatch(secret, /change|insecure|replace/i)

  // ...but the committed example must NOT contain the real one.
  assert.notEqual(/^JWT_SECRET=(.+)$/m.exec(read(result.root, '.env.example'))?.[1], secret)

  // The guard returns the reply, so the request stops before the handler.
  assert.match(read(result.root, 'app/middleware/auth.ts'), /return reply\.code\(401\)/)

  fs.rmSync(cwd, { recursive: true, force: true })
})

test('the generated TypeScript project typechecks', () => {
  const cwd = tmpdir()
  const result = scaffoldProject(cwd, { name: 'shop', language: 'ts', database: 'sqlite', auth: true })

  // Point the generated project at this working tree and at the already
  // installed dependency set, instead of installing from the registry.
  fs.symlinkSync(path.join(coreRoot, '..', '..', 'node_modules'), path.join(result.root, 'node_modules'), 'junction')
  const scoped = path.join(result.root, 'node_modules', '@lughjs')
  assert.ok(fs.existsSync(path.join(scoped, 'core')), '@lughjs/core must be linked in the workspace')

  const tsc = path.join(coreRoot, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc')
  try {
    execFileSync(process.execPath, [tsc, '-p', path.join(result.root, 'tsconfig.json'), '--noEmit'], {
      stdio: 'pipe',
      encoding: 'utf8',
    })
  } catch (err) {
    const out = (err as { stdout?: string }).stdout ?? String(err)
    assert.fail(`generated project failed to typecheck:\n${out}`)
  } finally {
    fs.unlinkSync(path.join(result.root, 'node_modules'))
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

test('refuses to overwrite a non-empty directory', () => {
  const cwd = tmpdir()
  fs.mkdirSync(path.join(cwd, 'taken'))
  fs.writeFileSync(path.join(cwd, 'taken', 'keep.txt'), 'do not clobber me')

  assert.throws(
    () => scaffoldProject(cwd, { name: 'taken', language: 'ts', database: 'sqlite', auth: false }),
    /already exists and is not empty/,
  )
  assert.equal(fs.readFileSync(path.join(cwd, 'taken', 'keep.txt'), 'utf8'), 'do not clobber me')

  fs.rmSync(cwd, { recursive: true, force: true })
})

test('rejects project names that are not valid package names', () => {
  for (const bad of ['', 'has space', '../escape', '.hidden', '@scope/name']) {
    assert.throws(() => assertValidProjectName(bad), /not a valid project name/, `"${bad}" must be rejected`)
  }
  for (const good of ['shop', 'my-app', 'my_app', 'app2']) {
    assert.doesNotThrow(() => assertValidProjectName(good))
  }
})

test('resolveOptions fills defaults without prompting when non-interactive', async () => {
  const opts = await resolveOptions({ name: 'quiet' }, { interactive: false })
  assert.deepEqual(opts, { name: 'quiet', language: 'ts', database: 'sqlite', auth: false } satisfies ScaffoldOptions)
})
