import test from 'node:test'
import assert from 'node:assert/strict'
import { buildContainer, registerFolder } from '../src/container.js'
import type { AwilixContainer } from 'awilix'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.join(here, 'fixtures', 'di')

test('buildContainer registers values and resolves classes with CLASSIC injection', async () => {
  const container: AwilixContainer = buildContainer({ db: { query: () => 'db' }, config: {}, env: { NODE_ENV: 'test' } })

  await registerFolder(container, path.join(fixture, 'services'))
  await registerFolder(container, path.join(fixture, 'controllers'))

  const keys = Object.keys(container.registrations).sort()
  assert.ok(keys.includes('postsService'), 'postsService registered')
  assert.ok(keys.includes('postsController'), 'postsController registered')

  const ctrl = container.resolve<{ postsService: unknown }>('postsController')
  assert.ok(ctrl.postsService, 'controller received injected service')
})

test('services are singletons — same instance per resolve', async () => {
  const container = buildContainer({ db: {}, config: {}, env: {} })
  await registerFolder(container, path.join(fixture, 'services'))
  const a = container.resolve('postsService')
  const b = container.resolve('postsService')
  assert.equal(a, b)
})

test('registerFolder throws on non-class default export', async () => {
  const dir = path.join(here, 'fixtures', 'di', 'bad')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'not_a_class.ts'), 'export default function helper() { return 1 }\n', 'utf8')
  const container = buildContainer({ db: {}, config: {}, env: {} })
  await assert.rejects(() => registerFolder(container, dir), /must export a class/)
  fs.rmSync(dir, { recursive: true, force: true })
})
