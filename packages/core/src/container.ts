import { createContainer, asClass, asValue, InjectionMode, type AwilixContainer } from 'awilix'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export interface ContainerDeps {
  db: unknown
  config: unknown
  env: Record<string, unknown>
}

/**
 * Builds the app's dependency-injection container. `db`, `config` and `env` are
 * registered as values; services and controllers are registered as singletons.
 * Everything is resolved at boot time, so route handlers end up as plain bound
 * methods and there is no per-request container cost.
 *
 * CLASSIC injection mode: constructor parameter names are matched against
 * registration keys (`constructor(private readonly postService: PostService)`),
 * so injection needs no decorators and no metadata reflection — which is
 * what lets a JavaScript project use the container exactly as a TypeScript one
 * does.
 */
export function buildContainer(deps: ContainerDeps): AwilixContainer {
  const container = createContainer({ injectionMode: InjectionMode.CLASSIC })
  container.register({
    db: asValue(deps.db),
    config: asValue(deps.config),
    env: asValue(deps.env),
  })
  return container
}

/**
 * Maps a file or class name to its container key.
 *
 * `posts_service` → `postsService`, `PostsController` → `postsController`,
 * `APIController` → `apiController`. The second regex splits an acronym run
 * from the word that follows it, so a file name and its class name always
 * resolve to the same key.
 */
export function toCamelCase(name: string): string {
  const parts = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
  return parts
    .map((p, i) => (i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join('')
}

/** Reserved keys that the framework itself registers. */
const RESERVED = new Set(['db', 'config', 'env'])

function isClass(value: unknown): boolean {
  return typeof value === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(value))
}

/**
 * Imports every module in a folder and registers its default export as a
 * singleton under the camelCased file name. Used for `app/services` and
 * `app/controllers`.
 *
 * Files are visited in sorted order so registration is deterministic, and a key
 * that would overwrite an existing registration is a hard error rather than a
 * silent shadow.
 */
export async function registerFolder(container: AwilixContainer, dir: string): Promise<string[]> {
  if (!fs.existsSync(dir)) return []
  const names: string[] = []
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(ts|js|mjs)$/.test(f) && !f.endsWith('.d.ts'))
    .sort()

  for (const file of files) {
    const full = path.join(dir, file)
    const mod = await import(pathToFileURL(full).href)
    const cls = mod.default
    if (!isClass(cls)) {
      throw new Error(`[lugh] ${full} must export a class as its default export`)
    }
    const key = toCamelCase(file.replace(/\.(ts|js|mjs)$/, ''))
    if (RESERVED.has(key)) {
      throw new Error(`[lugh] ${full} maps to the reserved container key "${key}"`)
    }
    if (container.hasRegistration(key)) {
      throw new Error(`[lugh] ${full} maps to container key "${key}", which is already registered`)
    }
    container.register({ [key]: asClass(cls).singleton() })
    names.push(key)
  }
  return names
}
