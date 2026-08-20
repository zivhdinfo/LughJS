import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import http from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createApp } from '../src/app.js'
import { runMigrations } from '../src/database.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.join(here, 'fixtures', 'app')

test('an invalid schema fails at BOOT, not on the first request', async (t) => {
  // Build a throwaway app dir with a broken schema in routes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lugh-schema-'))
  fs.cpSync(appRoot, dir, { recursive: true })
  // Corrupt the schema: `required` must be an array.
  const routesFile = path.join(dir, 'start', 'routes.ts')
  const routes = fs.readFileSync(routesFile, 'utf8').replace("required: ['title', 'body']", 'required: "not-an-array"')
  fs.writeFileSync(routesFile, routes, 'utf8')
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  await assert.rejects(
    () => createApp(dir),
    /schema|required|body|must/i,
    'boot must fail when a schema is invalid, because validation is compiled ahead of time',
  )
})

test('validation errors produce a 400 with a consistent JSON shape', async (t) => {
  const { server, db } = await createApp(appRoot)
  await runMigrations(db, path.join(appRoot, 'database', 'migrations'))
  t.after(async () => {
    await server.close()
    await db.destroy()
  })

  const res = await server.inject({ method: 'POST', url: '/posts', payload: { title: 'x' } })
  assert.equal(res.statusCode, 400)
  const body = res.json()
  assert.equal(typeof body.message, 'string')
  assert.ok(Array.isArray(body.errors), 'validation errors array present')
  assert.equal(body.errors.length >= 1, true)
  assert.equal(typeof body.errors[0].field, 'string')
  assert.equal('stack' in body, false, 'no stack trace in 400 responses')
})

test('an unknown route produces a 404 with a JSON body', async (t) => {
  const { server, db } = await createApp(appRoot)
  t.after(async () => {
    await server.close()
    await db.destroy()
  })
  const res = await server.inject({ method: 'GET', url: '/definitely-not-here' })
  assert.equal(res.statusCode, 404)
  assert.equal(typeof res.json().message, 'string')
})

test('a 500 never echoes the internal error message', async (t) => {
  // Outside production the detail is available for debugging, but it lives in
  // `error`/`stack`, and `message` is generic in EVERY environment so that a
  // handler which forwards only `message` can never leak SQL or stored values.
  const dev = await createApp(appRoot)
  const devBody = (await dev.server.inject({ method: 'GET', url: '/boom' })).json()
  assert.equal(devBody.message, 'Internal Server Error')
  assert.match(devBody.error, /kaboom/, 'dev keeps the detail in `error`')
  assert.ok(Array.isArray(devBody.stack), 'dev exposes the stack')
  await dev.server.close()
  await dev.db.destroy()

  process.env.NODE_ENV = 'production'
  const prod = await createApp(appRoot)
  const prodRes = await prod.server.inject({ method: 'GET', url: '/boom' })
  const prodBody = prodRes.json()
  assert.equal(prodRes.statusCode, 500)
  assert.equal(prodBody.message, 'Internal Server Error')
  assert.equal('stack' in prodBody, false, 'production hides the stack')
  assert.equal('error' in prodBody, false, 'production hides the error detail')
  assert.doesNotMatch(JSON.stringify(prodBody), /kaboom/, 'nothing internal reaches the client')
  await prod.server.close()
  await prod.db.destroy()
  delete process.env.NODE_ENV
})

test('a missing database driver explains itself instead of dumping a require stack', async (t) => {
  // knex throws a six-frame require stack from inside its own dialect loader,
  // and nothing in it says the project was never installed. That message was
  // the first thing a new user hit after skipping `npm install`.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lugh-driver-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  fs.mkdirSync(path.join(dir, 'config'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'start'), { recursive: true })
  // No imports anywhere in this fixture: it lives in a temp directory, so
  // nothing outside Node's builtins would resolve from there. An empty spec
  // object is valid; loadEnv still applies its own NODE_ENV default.
  fs.writeFileSync(path.join(dir, 'config', 'env.ts'), 'export default {}\n')
  fs.writeFileSync(path.join(dir, 'config', 'app.ts'), "export default { name: 'x', logger: false }\n")
  // mysql2 is not a dependency of this workspace, so the driver cannot resolve.
  fs.writeFileSync(
    path.join(dir, 'config', 'database.ts'),
    "export default { client: 'mysql2', connection: { host: '127.0.0.1' } }\n",
  )
  fs.writeFileSync(path.join(dir, 'start', 'routes.ts'), 'export default function routes() {}\n')

  await assert.rejects(
    () => createApp(dir),
    (err: Error) => {
      assert.match(err.message, /\[lugh\]/, 'the framework owns the message')
      assert.match(err.message, /mysql2/, 'and still names the driver')
      assert.match(err.message, /npm install/, 'and says what to do about it')
      assert.doesNotMatch(err.message, /Require stack/, 'without the require stack')
      return true
    },
  )
})

test('graceful shutdown drains in-flight requests and closes the DB pool', async (t) => {
  const { server, db } = await createApp(appRoot)
  await server.listen({ port: 0, host: '127.0.0.1' })
  const port = (server.server.address() as { port: number }).port
  t.after(async () => {
    await server.close().catch(() => undefined)
    await db.destroy().catch(() => undefined)
  })

  // /slow takes 500ms, and it is a REAL HTTP request, so the drain must wait for it.
  const request = new Promise<void>((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/slow`, (res) => {
      res.resume()
      res.on('end', resolve)
    })
    req.on('error', reject)
  })

  // Give the request time to reach the handler before shutting down.
  await new Promise((r) => setTimeout(r, 100))

  const { gracefulShutdown } = await import('../src/shutdown.js')
  const events: string[] = []
  const closing = gracefulShutdown(server, db, {
    logger: (m) => events.push(m),
    timeoutMs: 2000,
  })

  // shutdown must not complete while the request is in flight
  let settled = false
  closing.then(() => (settled = true))
  await new Promise((r) => setTimeout(r, 150))
  assert.equal(settled, false, 'shutdown must wait for in-flight requests')

  await request
  await closing
  assert.equal(settled, true)
  assert.ok(events.some((e) => e.includes('stopping')), 'stopping phase logged')
  assert.ok(events.some((e) => e.includes('database pool')), 'db close phase logged')
})

test('a missing required env var fails fast at boot with a clear message', async (t) => {
  // Fixture env.ts requires NODE_ENV with choices; remove it to force failure.
  const { loadEnv } = await import('../src/env.js')
  const envBackup = { ...process.env }
  delete process.env.NODE_ENV
  t.after(() => {
    process.env = { ...envBackup }
  })
  const { str } = await import('envalid')
  assert.throws(
    () => loadEnv(here, { REQUIRED_THING: str() }),
    /REQUIRED_THING|Invalid environment variables/,
  )
})

test('an env value outside its declared choices fails fast', async (t) => {
  const { loadEnv } = await import('../src/env.js')
  const { str } = await import('envalid')
  const envBackup = { ...process.env }
  process.env.NODE_ENV = 'not-a-valid-choice'
  t.after(() => {
    process.env = { ...envBackup }
  })
  assert.throws(
    () => loadEnv(here, { NODE_ENV: str({ choices: ['development', 'test', 'production'] }) }),
    /NODE_ENV|not-a-valid-choice|Invalid/,
  )
})

test('SIGTERM triggers graceful shutdown in a real process', async () => {
  // Boot the fixture app in a child process and send SIGTERM.
  const serverEntry = path.join(appRoot, 'signal-server.ts')
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', serverEntry], {
    cwd: appRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0' },
  })
  let output = ''
  child.stdout?.on('data', (d) => (output += String(d)))
  child.stderr?.on('data', (d) => (output += String(d)))

  // Wait for the server to announce readiness.
  const deadline = Date.now() + 15000
  while (!output.includes('READY') && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100))
  }
  assert.ok(output.includes('READY'), `server did not become ready: ${output}`)

  const exitPromise = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)))

  if (process.platform === 'win32') {
    // Windows: node children have no real SIGTERM delivery; the signal-server
    // also listens for a stdin "shutdown" line, so send that instead.
    child.stdin?.write('shutdown\n')
  } else {
    child.kill('SIGTERM')
  }

  const code = await Promise.race([exitPromise, new Promise<null>((r) => setTimeout(() => r(null), 15000))])
  assert.notEqual(code, null, 'process must exit after shutdown signal')
  assert.ok(output.includes('shutdown complete') || output.includes('stopping'), `graceful shutdown logged: ${output}`)
})
