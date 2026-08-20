import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from '../src/app.js'
import { runMigrations } from '../src/database.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.join(here, 'fixtures', 'app')

test('createApp boots and routes resolve through DI', async (t) => {
  const { server, db } = await createApp(appRoot)
  await runMigrations(db, path.join(appRoot, 'database', 'migrations'))
  t.after(async () => {
    await server.close()
    await db.destroy()
  })

  // health route (inline handler)
  const health = await server.inject({ method: 'GET', url: '/health' })
  assert.equal(health.statusCode, 200)
  assert.deepEqual(health.json(), { status: 'ok' })

  // controller route, service hits the DB
  const list = await server.inject({ method: 'GET', url: '/posts' })
  assert.equal(list.statusCode, 200)
  assert.deepEqual(list.json(), [])
})

test('validated POST creates a row, invalid body is rejected with 400', async (t) => {
  const { server, db } = await createApp(appRoot)
  await runMigrations(db, path.join(appRoot, 'database', 'migrations'))
  t.after(async () => {
    await server.close()
    await db.destroy()
  })

  const bad = await server.inject({
    method: 'POST',
    url: '/posts',
    payload: { title: 'missing body' },
  })
  assert.equal(bad.statusCode, 400)

  const good = await server.inject({
    method: 'POST',
    url: '/posts',
    payload: { title: 'Hello', body: 'World' },
  })
  assert.equal(good.statusCode, 201)
  const created = good.json()
  assert.equal(created.title, 'Hello')
  assert.ok(created.id > 0)

  const show = await server.inject({ method: 'GET', url: `/posts/${created.id}` })
  assert.equal(show.statusCode, 200)
  assert.equal(show.json().body, 'World')
})

test('404 handling and DELETE round-trip', async (t) => {
  const { server, db } = await createApp(appRoot)
  await runMigrations(db, path.join(appRoot, 'database', 'migrations'))
  t.after(async () => {
    await server.close()
    await db.destroy()
  })

  const missing = await server.inject({ method: 'GET', url: '/posts/999' })
  assert.equal(missing.statusCode, 404)

  const created = await server.inject({
    method: 'POST',
    url: '/posts',
    payload: { title: 'To delete', body: 'bye' },
  })
  const id = created.json().id

  const del = await server.inject({ method: 'DELETE', url: `/posts/${id}` })
  assert.equal(del.statusCode, 204)

  const gone = await server.inject({ method: 'GET', url: `/posts/${id}` })
  assert.equal(gone.statusCode, 404)
})

test('global middleware from app/middleware is applied', async (t) => {
  const { server, db } = await createApp(appRoot)
  await runMigrations(db, path.join(appRoot, 'database', 'migrations'))
  t.after(async () => {
    await server.close()
    await db.destroy()
  })

  const res = await server.inject({ method: 'GET', url: '/health' })
  assert.equal(res.headers['x-test-middleware'], 'applied')
})

test('per-route middleware runs only on its route', async (t) => {
  const { server, db } = await createApp(appRoot)
  await runMigrations(db, path.join(appRoot, 'database', 'migrations'))
  t.after(async () => {
    await server.close()
    await db.destroy()
  })

  const scoped = await server.inject({ method: 'GET', url: '/scoped' })
  assert.equal(scoped.headers['x-scoped'], 'yes')
  const unscoped = await server.inject({ method: 'GET', url: '/health' })
  assert.equal(unscoped.headers['x-scoped'], undefined)
})
