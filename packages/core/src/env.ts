import { config as dotenvConfig } from 'dotenv'
import fs from 'node:fs'
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
 * variable is missing or malformed. It throws rather than calling `process.exit`, so callers
 * can catch and report it.
 *
 * The result is a plain object rather than envalid's strict proxy: the proxy
 * throws on any access to an undeclared key, which turns a harmless
 * `env.SOMETHING` lookup in user code into a crash.
 */
export function loadEnv(projectRoot: string, specs: EnvSpecs): Record<string, unknown> {
  const envFile = path.join(projectRoot, '.env')
  dotenvConfig({ path: envFile })

  const cleaned = cleanEnv(process.env, { ...BASE_SPECS, ...specs }, {
    reporter: ({ errors }) => {
      const keys = Object.keys(errors)
      if (keys.length === 0) return
      const lines = keys.map((k) => `  ${k}: ${describeEnvError(errors[k])}`)
      throw new Error(
        `[lugh] Invalid environment variables:\n${lines.join('\n')}\n\n${envHint(projectRoot, envFile)}`,
      )
    },
  })

  return { ...(cleaned as unknown as Record<string, unknown>) }
}

/**
 * envalid reports a missing variable as an `EnvMissingError` whose `message` is
 * the string "undefined", so the obvious `String(err)` renders the useless
 * "EnvMissingError: undefined". Every branch here exists to say what actually
 * went wrong instead.
 */
function describeEnvError(err: unknown): string {
  if (err === undefined || err === null) return 'missing'
  const name = (err as { constructor?: { name?: string } }).constructor?.name
  if (name === 'EnvMissingError') return 'missing, and config/env declares no default for it'
  const message = (err as { message?: string }).message
  if (typeof message === 'string' && message.length > 0 && message !== 'undefined') return message
  return 'invalid'
}

/** Points at the file the caller most likely forgot, if it is not there. */
function envHint(projectRoot: string, envFile: string): string {
  const example = path.join(projectRoot, '.env.example')
  if (!fs.existsSync(envFile) && fs.existsSync(example)) {
    return `There is no .env in ${projectRoot}. Copy .env.example to .env and fill it in, or inject these variables from the environment.`
  }
  return `Set them in ${envFile}, or inject them from the environment. They are declared in config/env.`
}
