import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
import { cleanEnv, str, type Spec } from 'envalid'

export type EnvSpecs = Record<string, Spec<unknown>>

/**
 * `NODE_ENV` is read by the framework itself (the error handler decides whether
 * to attach debug detail), so it is always validated even when an app's
 * `config/env.ts` forgets to declare it.
 */
const BASE_SPECS: EnvSpecs = {
  NODE_ENV: str({ default: 'development', choices: ['development', 'test', 'production'] }) as Spec<unknown>,
}

/**
 * Loads `.env` from the project root, then validates and cleans `process.env`
 * against the app-provided envalid specs. Throws at boot when a required
 * variable is missing or malformed — a throw, not `process.exit`, so callers
 * can catch and report it.
 *
 * The result is a plain object rather than envalid's strict proxy: the proxy
 * throws on any access to an undeclared key, which turns a harmless
 * `env.SOMETHING` lookup in user code into a crash.
 */
export function loadEnv(projectRoot: string, specs: EnvSpecs): Record<string, unknown> {
  dotenvConfig({ path: path.join(projectRoot, '.env') })

  const cleaned = cleanEnv(process.env, { ...BASE_SPECS, ...specs }, {
    reporter: ({ errors }) => {
      const keys = Object.keys(errors)
      if (keys.length === 0) return
      const detail = keys
        .map((k) => `${k}: ${errors[k] === undefined ? 'missing' : String(errors[k])}`)
        .join(', ')
      throw new Error(`[lugh] Invalid environment variables: ${detail}`)
    },
  })

  return { ...(cleaned as unknown as Record<string, unknown>) }
}
