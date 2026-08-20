import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { migrationTemplate, timestamp, write, type Language } from './generators.js'

export type DatabaseChoice = 'sqlite' | 'postgres' | 'mysql'

export interface ScaffoldOptions {
  name: string
  language: Language
  database: DatabaseChoice
  auth: boolean
}

const CORE_VERSION = '^2.0.0'

const DB_DRIVER: Record<DatabaseChoice, { pkg: string; version: string; client: string }> = {
  sqlite: { pkg: 'better-sqlite3', version: '^12.0.0', client: 'better-sqlite3' },
  postgres: { pkg: 'pg', version: '^8.13.0', client: 'pg' },
  mysql: { pkg: 'mysql2', version: '^3.11.0', client: 'mysql2' },
}

/** A project directory name must be usable as an npm package name. */
export function assertValidProjectName(name: string): void {
  if (!name || !/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    throw new Error(
      `[lugh] "${name}" is not a valid project name: use letters, digits, dots, dashes or underscores, starting with a letter or digit`,
    )
  }
}

const ext = (lang: Language) => (lang === 'ts' ? 'ts' : 'js')

// ─────────────────────────────────────────────────────────────────────────────
// interactive prompts
// ─────────────────────────────────────────────────────────────────────────────

interface Choice<T> {
  value: T
  label: string
}

async function ask<T extends string>(
  rl: ReturnType<typeof createInterface>,
  question: string,
  choices: Choice<T>[],
  fallback: T,
): Promise<T> {
  const lines = choices.map((c, i) => `  ${i + 1}) ${c.label}${c.value === fallback ? '  (default)' : ''}`)
  const answer = (await rl.question(`\n${question}\n${lines.join('\n')}\n> `)).trim()
  if (!answer) return fallback
  const byIndex = choices[Number(answer) - 1]
  if (byIndex) return byIndex.value
  const byValue = choices.find((c) => c.value === answer.toLowerCase())
  if (byValue) return byValue.value
  console.log(`  (unrecognised "${answer}", using ${fallback})`)
  return fallback
}

async function askYesNo(
  rl: ReturnType<typeof createInterface>,
  question: string,
  fallback: boolean,
): Promise<boolean> {
  const hint = fallback ? 'Y/n' : 'y/N'
  const answer = (await rl.question(`\n${question} (${hint}) > `)).trim().toLowerCase()
  if (!answer) return fallback
  return answer.startsWith('y')
}

/**
 * Fills in whatever the caller did not pass on the command line by prompting.
 * With `--yes`, or on a non-interactive stdin, defaults are used silently.
 */
export async function resolveOptions(
  partial: Partial<ScaffoldOptions>,
  opts: { interactive: boolean } = { interactive: true },
): Promise<ScaffoldOptions> {
  const defaults: ScaffoldOptions = {
    name: partial.name ?? 'my-app',
    language: partial.language ?? 'ts',
    database: partial.database ?? 'sqlite',
    auth: partial.auth ?? false,
  }

  const needsPrompt =
    opts.interactive &&
    process.stdin.isTTY &&
    (partial.name === undefined ||
      partial.language === undefined ||
      partial.database === undefined ||
      partial.auth === undefined)

  if (!needsPrompt) {
    assertValidProjectName(defaults.name)
    return defaults
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    let name = partial.name
    while (name === undefined) {
      const answer = (await rl.question(`\nProject name > (${defaults.name}) `)).trim() || defaults.name
      try {
        assertValidProjectName(answer)
        name = answer
      } catch (err) {
        console.log(`  ${(err as Error).message}`)
      }
    }

    const language =
      partial.language ??
      (await ask<Language>(
        rl,
        'Language',
        [
          { value: 'ts', label: 'TypeScript' },
          { value: 'js', label: 'JavaScript' },
        ],
        'ts',
      ))

    const database =
      partial.database ??
      (await ask<DatabaseChoice>(
        rl,
        'Database',
        [
          { value: 'sqlite', label: 'SQLite   (better-sqlite3, zero setup)' },
          { value: 'postgres', label: 'PostgreSQL (pg)' },
          { value: 'mysql', label: 'MySQL / MariaDB (mysql2)' },
        ],
        'sqlite',
      ))

    const auth = partial.auth ?? (await askYesNo(rl, 'Include the auth scaffold (JWT + bcrypt + users table)?', false))

    assertValidProjectName(name)
    return { name, language, database, auth }
  } finally {
    rl.close()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// file templates
// ─────────────────────────────────────────────────────────────────────────────

function packageJson(o: ScaffoldOptions): string {
  const driver = DB_DRIVER[o.database]
  const deps: Record<string, string> = {
    '@lughjs/core': CORE_VERSION,
    // Declared explicitly rather than relying on hoisting from @lughjs/core:
    // config/env and config/database import these directly.
    envalid: '^8.0.0',
    knex: '^3.1.0',
    [driver.pkg]: driver.version,
  }
  if (o.auth) {
    Object.assign(deps, {
      '@fastify/cors': '^11.0.0',
      '@fastify/helmet': '^13.0.0',
      '@fastify/jwt': '^10.0.0',
      '@fastify/rate-limit': '^11.0.0',
      bcryptjs: '^3.0.0',
    })
  }

  const devDeps: Record<string, string> =
    o.language === 'ts'
      ? { '@types/node': '^24.0.0', typescript: '^5.6.0', ...(o.auth ? { '@types/bcryptjs': '^2.4.6' } : {}) }
      : {}

  const scripts: Record<string, string> = {
    dev: 'lugh dev',
    start: 'lugh serve',
    migrate: 'lugh migration:run',
    seed: 'lugh db:seed',
    routes: 'lugh list:routes',
  }
  if (o.language === 'ts') scripts.typecheck = 'tsc -p tsconfig.json --noEmit'

  return `${JSON.stringify(
    {
      name: o.name,
      private: true,
      version: '0.1.0',
      type: 'module',
      engines: { node: '>=22' },
      scripts,
      dependencies: sortKeys(deps),
      ...(Object.keys(devDeps).length ? { devDependencies: sortKeys(devDeps) } : {}),
    },
    null,
    2,
  )}\n`
}

function sortKeys(o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))
}

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["app/**/*.ts", "config/**/*.ts", "database/**/*.ts", "start/**/*.ts"]
}
`

const GITIGNORE = `node_modules/
dist/
coverage/
*.sqlite
*.sqlite-journal
.env
`

function envFile(o: ScaffoldOptions, secret: string): string {
  const dbLines: Record<DatabaseChoice, string> = {
    sqlite: 'DB_FILE=./database/app.sqlite',
    postgres: `DB_HOST=127.0.0.1\nDB_PORT=5432\nDB_USER=postgres\nDB_PASSWORD=\nDB_NAME=${o.name.replace(/[^a-z0-9_]/gi, '_')}`,
    mysql: `DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASSWORD=\nDB_NAME=${o.name.replace(/[^a-z0-9_]/gi, '_')}`,
  }
  const auth = o.auth
    ? `\n# Generated for this project. Rotate it before going to production.\nJWT_SECRET=${secret}\nJWT_EXPIRES_IN=1h\nRATE_LIMIT_MAX=100\nCORS_ORIGIN=http://localhost:3000\n`
    : ''
  return `NODE_ENV=development
HOST=127.0.0.1
PORT=3000
LOGGER=true
${dbLines[o.database]}
${auth}`
}

function configEnv(o: ScaffoldOptions): string {
  const l = o.language
  const dbSpecs: Record<DatabaseChoice, string> = {
    sqlite: `  DB_FILE: str({ default: './database/app.sqlite' }),`,
    postgres: `  DB_HOST: str({ default: '127.0.0.1' }),
  DB_PORT: num({ default: 5432 }),
  DB_USER: str({ default: 'postgres' }),
  DB_PASSWORD: str({ default: '' }),
  DB_NAME: str(),`,
    mysql: `  DB_HOST: str({ default: '127.0.0.1' }),
  DB_PORT: num({ default: 3306 }),
  DB_USER: str({ default: 'root' }),
  DB_PASSWORD: str({ default: '' }),
  DB_NAME: str(),`,
  }
  const usesNum = o.database !== 'sqlite'
  const imported = ['str', 'num', 'bool'].filter((n) => n !== 'num' || usesNum || true).join(', ')

  const authSpecs = o.auth
    ? `
  // No default: a missing JWT_SECRET must stop the boot, never fall back to a
  // shared literal that would ship to production.
  JWT_SECRET: str(),
  JWT_EXPIRES_IN: str({ default: '1h' }),
  RATE_LIMIT_MAX: num({ default: 100 }),
  CORS_ORIGIN: str({ default: 'http://localhost:3000' }),`
    : ''

  return `import { ${imported} } from 'envalid'

export default {
  NODE_ENV: str({ default: 'development', choices: ['development', 'test', 'production'] }),
  HOST: str({ default: '127.0.0.1' }),
  PORT: num({ default: 3000 }),
  LOGGER: bool({ default: true }),
${dbSpecs[o.database]}${authSpecs}
}
`
}

function configApp(o: ScaffoldOptions): string {
  return `export default {
  name: '${o.name}',
  // Pino request logging. Turn it off when measuring throughput.
  logger: process.env.LOGGER !== 'false',
  // Low-level server options, e.g. { trustProxy: true }.
  server: {},
}
`
}

function configDatabase(o: ScaffoldOptions): string {
  const l = o.language
  const typeImport = l === 'ts' ? `import type { Knex } from 'knex'\n\n` : ''
  const decl = l === 'ts' ? `const config: Knex.Config = ` : `const config = `

  const bodies: Record<DatabaseChoice, string> = {
    sqlite: `{
  client: 'better-sqlite3',
  connection: { filename: process.env.DB_FILE ?? './database/app.sqlite' },
  useNullAsDefault: true,
  pool: { min: 1, max: 1 },
}`,
    postgres: `{
  client: 'pg',
  connection: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
  },
  pool: { min: 2, max: 10 },
}`,
    mysql: `{
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
  },
  pool: { min: 2, max: 10 },
}`,
  }

  return `${typeImport}${decl}${bodies[o.database]}

export default config
`
}

function startServer(o: ScaffoldOptions): string {
  return `import { createApp, installShutdownHandlers } from '@lughjs/core'

const { server, db, env } = await createApp(process.cwd())

installShutdownHandlers(server, db, { logger: (msg) => server.log.info(msg) })

await server.listen({ host: String(env.HOST), port: Number(env.PORT) })
`
}

function startRoutes(o: ScaffoldOptions): string {
  const authImport = o.auth ? `import { auth } from '../app/middleware/auth.js'\n` : ''

  // A response schema is both a serialization speed-up (fast-json-stringify)
  // and a hard guarantee about which columns can leave the process.
  const postSchema = `const postSchema = {
  body: {
    type: 'object',
    required: ['title', 'body'],
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 255 },
      body: { type: 'string', minLength: 1 },
    },
  },
  response: {
    200: { $ref: 'post#' },
    201: { $ref: 'post#' },
  },
}`

  const authSchemas = o.auth
    ? `
const registerSchema = {
  body: {
    type: 'object',
    required: ['name', 'email', 'password'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 255 },
      email: { type: 'string', format: 'email', maxLength: 255 },
      password: { type: 'string', minLength: 8, maxLength: 128 },
    },
  },
  response: { 201: { $ref: 'user#' } },
}

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 1 },
    },
  },
}
`
    : ''

  const guarded = o.auth ? `.middleware(auth)` : ''

  const decl = (line: string) => `  ${line}`
  const authBlock = o.auth
    ? `
  // Auth
  Route.post('/auth/register', 'AuthController.register').schema(registerSchema)
  Route.post('/auth/login', 'AuthController.login').schema(loginSchema)
  Route.get('/auth/me', 'AuthController.me').middleware(auth)
`
    : ''

  return `import { Route } from '@lughjs/core'
${authImport}
${postSchema}
${authSchemas}
// The route table lives inside a function: ES modules evaluate once per
// process, so top-level Route calls would register nothing on a second boot.
export default function routes()${o.language === 'ts' ? ': void' : ''} {
${decl(`Route.get('/health', async () => ({ status: 'ok' }))`)}

  Route.group('/api', () => {${authBlock}${o.auth ? '\n    // Reads are public; writes require a valid token.' : ''}
    Route.get('/posts', 'PostController.index')
    Route.get('/posts/:id', 'PostController.show')
    Route.post('/posts', 'PostController.store').schema(postSchema)${guarded}
    Route.put('/posts/:id', 'PostController.update').schema(postSchema)${guarded}
    Route.delete('/posts/:id', 'PostController.destroy')${guarded}
  })
}
`
}

/**
 * Registers the shared response schemas. Declaring them once and referencing
 * them with `$ref` keeps every route's output on the fast serializer and makes
 * the set of exposed columns explicit in one place.
 */
function schemasMiddleware(o: ScaffoldOptions): string {
  const l = o.language
  const sig = l === 'ts' ? `(server: LughServer)` : `(server)`
  const imports = l === 'ts' ? `import type { LughServer } from '@lughjs/core'\n\n` : ''
  const userSchema = o.auth
    ? `
  server.addSchema({
    $id: 'user',
    type: 'object',
    // password_hash is deliberately absent: fast-json-stringify emits only the
    // properties listed here, so it cannot leak even if a query selects it.
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      email: { type: 'string' },
      created_at: { type: 'string' },
    },
  })
`
    : ''

  return `${imports}export default async function schemas${sig} {
  server.addSchema({
    $id: 'post',
    type: 'object',
    properties: {
      id: { type: 'integer' },
      title: { type: 'string' },
      body: { type: 'string' },
      created_at: { type: 'string' },
      updated_at: { type: 'string' },
    },
  })
${userSchema}}
`
}

function requestLogger(o: ScaffoldOptions): string {
  const l = o.language
  const sig = l === 'ts' ? `(server: LughServer)` : `(server)`
  const imports = l === 'ts' ? `import type { LughServer } from '@lughjs/core'\n\n` : ''
  return `${imports}export default async function requestLogger${sig} {
  server.addHook('onResponse', (request, reply, done) => {
    request.log.info({ url: request.url, status: reply.statusCode }, 'request')
    done()
  })
}
`
}

function securityMiddleware(o: ScaffoldOptions): string {
  const l = o.language
  const sig = l === 'ts' ? `(server: LughServer)` : `(server)`
  const imports =
    l === 'ts'
      ? `import type { LughServer } from '@lughjs/core'\nimport helmet from '@fastify/helmet'\nimport cors from '@fastify/cors'\nimport rateLimit from '@fastify/rate-limit'\nimport jwt from '@fastify/jwt'\n\n`
      : `import helmet from '@fastify/helmet'\nimport cors from '@fastify/cors'\nimport rateLimit from '@fastify/rate-limit'\nimport jwt from '@fastify/jwt'\n\n`

  return `${imports}/**
 * These are ecosystem plugins that deliberately publish their decorators onto
 * the root instance, so \`register\` is the right entry point for them. A plain
 * hook module in this folder must NOT use \`register\`, because Lugh invokes those
 * directly, precisely so their hooks reach every route.
 */
export default async function security${sig} {
  await server.register(helmet)

  await server.register(cors, {
    // An explicit origin list. \`origin: true\` reflects whatever Origin the
    // caller sends, which defeats CORS entirely once credentials are involved.
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
  })

  await server.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    timeWindow: '1 minute',
  })

  // config/env.ts declares JWT_SECRET without a default, so the boot has
  // already failed if it is missing. No fallback literal is defined here.
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required')

  await server.register(jwt, {
    secret,
    sign: { expiresIn: process.env.JWT_EXPIRES_IN ?? '1h' },
  })
}
`
}

function authMiddleware(o: ScaffoldOptions): string {
  const l = o.language
  const sig = l === 'ts' ? `(request: LughRequest, reply: LughReply): Promise<void>` : `(request, reply)`
  const imports = l === 'ts' ? `import type { LughRequest, LughReply } from '@lughjs/core'\n\n` : ''
  return `${imports}/**
 * Per-route auth guard: \`Route.get('/x', 'C.a').middleware(auth)\`.
 *
 * The \`return\` after \`reply.send\` matters. An onRequest hook that sends a
 * reply without returning it does not stop the request: the route handler
 * still runs, against a reply that has already been sent.
 */
export async function auth${sig} {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ message: 'Unauthorized' })
  }
}
`
}

function authController(o: ScaffoldOptions): string {
  const l = o.language
  const t = (s: string) => (l === 'ts' ? s : '')
  const imports =
    l === 'ts'
      ? `import type { LughRequest, LughReply } from '@lughjs/core'\nimport AuthService from '../services/auth_service.js'\n\n`
      : `import AuthService from '../services/auth_service.js'\n\n`
  const ctor =
    l === 'ts'
      ? `  constructor(private readonly authService: AuthService) {}`
      : `  #authService\n\n  constructor(authService) {\n    this.#authService = authService\n  }`
  const self = l === 'ts' ? 'this.authService' : 'this.#authService'
  const req = (n: string) => (l === 'ts' ? `${n}: LughRequest` : n)
  const rep = (n: string) => (l === 'ts' ? `${n}: LughReply` : n)

  return `${imports}export default class AuthController {
${ctor}

  async register(${req('request')}, ${rep('reply')}) {
    const user = await ${self}.register(request.body${t(' as { name: string; email: string; password: string }')})
    reply.code(201)
    return user
  }

  async login(${req('request')}, ${rep('reply')}) {
    const { email, password } = request.body${t(' as { email: string; password: string }')}
    const user = await ${self}.verify(email, password)
    // Claims stay minimal: an id is enough to look the user up again.
    const token = await reply.jwtSign({ sub: user.id })
    return { token, user }
  }

  async me(${req('request')}, ${rep('reply')}) {
    const { sub } = request.user${t(' as { sub: number }')}
    const user = await ${self}.findById(Number(sub))
    if (!user) return reply.code(404).send({ message: 'Not found' })
    return user
  }
}
`
}

function authService(o: ScaffoldOptions): string {
  const l = o.language
  const t = (s: string) => (l === 'ts' ? s : '')
  const imports =
    l === 'ts'
      ? `import bcrypt from 'bcryptjs'\nimport type { Knex } from 'knex'\n\ninterface UserRow {\n  id: number\n  name: string\n  email: string\n  password_hash: string\n}\n\n`
      : `import bcrypt from 'bcryptjs'\n\n`
  const ctor = l === 'ts' ? `  constructor(private readonly db: Knex) {}` : `  constructor(db) {\n    this.db = db\n  }`

  return `${imports}export class AuthError extends Error {
  constructor(message${t(': string')}, statusCode${t(': number')} = 401) {
    super(message)
    this.statusCode = statusCode
  }
${t('\n  statusCode: number\n')}}

// Columns that may ever be returned to a client. password_hash is not one.
const PUBLIC_COLUMNS = ['id', 'name', 'email', 'created_at']

export default class AuthService {
${ctor}

  async register(input${t(': { name: string; email: string; password: string }')}) {
    const existing = await this.db${t('<UserRow>')}('users').where({ email: input.email }).first()
    if (existing) throw new AuthError('Email already registered', 409)

    const password_hash = await bcrypt.hash(input.password, 12)
    const [user] = await this.db('users')
      .insert({ name: input.name, email: input.email, password_hash })
      .returning(PUBLIC_COLUMNS)
    return user
  }

  async verify(email${t(': string')}, password${t(': string')}) {
    const user = await this.db${t('<UserRow>')}('users').where({ email }).first()

    // Always run a comparison, even when the email is unknown, so the response
    // time does not reveal whether an account exists.
    const hash = user?.password_hash ?? DUMMY_HASH
    const ok = await bcrypt.compare(password, hash)
    if (!user || !ok) throw new AuthError('Invalid credentials')

    return { id: user.id, name: user.name, email: user.email }
  }

  async findById(id${t(': number')}) {
    return this.db('users').where({ id }).first(PUBLIC_COLUMNS)
  }
}

// A real bcrypt hash of a value nothing can match; keeps the timing uniform.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'
`
}

function postModel(o: ScaffoldOptions): string {
  const ovr = o.language === 'ts' ? 'override ' : ''
  return `import { BaseModel } from '@lughjs/core'

export default class Post extends BaseModel {
  static ${ovr}tableName = 'posts'
}
`
}

function userModel(o: ScaffoldOptions): string {
  const ovr = o.language === 'ts' ? 'override ' : ''
  return `import { BaseModel } from '@lughjs/core'

export default class User extends BaseModel {
  static ${ovr}tableName = 'users'
}
`
}

function postService(o: ScaffoldOptions): string {
  const l = o.language
  const t = (s: string) => (l === 'ts' ? s : '')
  const imports =
    l === 'ts'
      ? `import type { Knex } from 'knex'\nimport Post from '../models/post.js'\n\ninterface PostInput {\n  title: string\n  body: string\n}\n\n`
      : `import Post from '../models/post.js'\n\n`
  const ctor = l === 'ts' ? `  constructor(private readonly db: Knex) {}` : `  constructor(db) {\n    this.db = db\n  }`

  return `${imports}export default class PostService {
${ctor}

  all() {
    return Post.query().orderBy('id', 'desc')
  }

  find(id${t(': number')}) {
    return Post.query().findById(id)
  }

  // Only the two columns a client is allowed to set are read off the input.
  // passing \`request.body\` straight to insert() is mass assignment.
  create(input${t(': PostInput')}) {
    return Post.query().insert({ title: input.title, body: input.body })
  }

  async update(id${t(': number')}, input${t(': PostInput')}) {
    await Post.query().patch({ title: input.title, body: input.body }).where('id', id)
    return this.find(id)
  }

  async destroy(id${t(': number')}) {
    await Post.query().deleteById(id)
  }
}
`
}

function postController(o: ScaffoldOptions): string {
  const l = o.language
  const t = (s: string) => (l === 'ts' ? s : '')
  const imports =
    l === 'ts'
      ? `import type { LughRequest, LughReply } from '@lughjs/core'\nimport PostService from '../services/post_service.js'\n\n`
      : `import PostService from '../services/post_service.js'\n\n`
  const ctor =
    l === 'ts'
      ? `  constructor(private readonly postService: PostService) {}`
      : `  #postService\n\n  constructor(postService) {\n    this.#postService = postService\n  }`
  const self = l === 'ts' ? 'this.postService' : 'this.#postService'
  const req = (n: string) => (l === 'ts' ? `${n}: LughRequest` : n)
  const rep = (n: string) => (l === 'ts' ? `${n}: LughReply` : n)
  const id = l === 'ts' ? `Number((request.params as { id: string }).id)` : `Number(request.params.id)`
  const body = l === 'ts' ? `request.body as { title: string; body: string }` : `request.body`

  return `${imports}export default class PostController {
${ctor}

  async index(${req('request')}, ${rep('reply')}) {
    return ${self}.all()
  }

  async show(${req('request')}, ${rep('reply')}) {
    const post = await ${self}.find(${id})
    if (!post) return reply.code(404).send({ message: 'Not found' })
    return post
  }

  async store(${req('request')}, ${rep('reply')}) {
    const post = await ${self}.create(${body})
    reply.code(201)
    return post
  }

  async update(${req('request')}, ${rep('reply')}) {
    const post = await ${self}.update(${id}, ${body})
    if (!post) return reply.code(404).send({ message: 'Not found' })
    return post
  }

  async destroy(${req('request')}, ${rep('reply')}) {
    await ${self}.destroy(${id})
    reply.code(204)
    return reply.send()
  }
}
`
}

function postsMigration(lang: Language): string {
  const sig = lang === 'ts' ? `(knex: Knex): Promise<void>` : `(knex)`
  const imports = lang === 'ts' ? `import type { Knex } from 'knex'\n\n` : ''
  return `${imports}export async function up${sig} {
  await knex.schema.createTable('posts', (table) => {
    table.increments('id')
    table.string('title', 255).notNullable()
    table.text('body').notNullable()
    table.timestamps(true, true)
  })
}

export async function down${sig} {
  await knex.schema.dropTableIfExists('posts')
}
`
}

function usersMigration(lang: Language): string {
  const sig = lang === 'ts' ? `(knex: Knex): Promise<void>` : `(knex)`
  const imports = lang === 'ts' ? `import type { Knex } from 'knex'\n\n` : ''
  return `${imports}export async function up${sig} {
  await knex.schema.createTable('users', (table) => {
    table.increments('id')
    table.string('name', 255).notNullable()
    table.string('email', 255).notNullable().unique()
    table.string('password_hash', 255).notNullable()
    table.timestamps(true, true)
  })
}

export async function down${sig} {
  await knex.schema.dropTableIfExists('users')
}
`
}

function seeder(lang: Language): string {
  const sig = lang === 'ts' ? `(knex: Knex): Promise<void>` : `(knex)`
  const imports = lang === 'ts' ? `import type { Knex } from 'knex'\n\n` : ''
  return `${imports}export async function seed${sig} {
  await knex('posts').del()
  await knex('posts').insert([
    { title: 'Hello', body: 'First post.' },
    { title: 'Second', body: 'Another post.' },
  ])
}
`
}

function readme(o: ScaffoldOptions): string {
  const dbSetup: Record<DatabaseChoice, string> = {
    sqlite: 'No setup needed. The SQLite file is created on first migration.',
    postgres: 'Create the database named in `DB_NAME` and set `DB_USER`/`DB_PASSWORD` in `.env`.',
    mysql: 'Create the schema named in `DB_NAME` and set `DB_USER`/`DB_PASSWORD` in `.env`.',
  }
  return `# ${o.name}

Built with [Lugh](https://github.com/zivhdinfo/LughJS).

- Language: **${o.language === 'ts' ? 'TypeScript' : 'JavaScript'}**
- Database: **${o.database}**
- Auth scaffold: **${o.auth ? 'included' : 'not included'}**

## Getting started

\`\`\`bash
npm install
cp .env.example .env      # then edit it
npm run migrate
npm run seed
npm run dev               # http://127.0.0.1:3000
\`\`\`

${dbSetup[o.database]}

## Layout

\`\`\`
app/
  controllers/   HTTP entry points; receive the request and reply directly
  services/      business logic, injected into controllers by parameter name
  models/        Objection models
  middleware/    global hooks, auto-registered at boot in file-name order
config/          env specs, app config, database config
database/
  migrations/    up()/down()
  seeders/       seed()
start/
  routes.ts      route table
  server.ts      entry point
\`\`\`

## Commands

\`\`\`bash
lugh make:controller Post
lugh make:model Post
lugh make:service Post
lugh make:migration create_posts
lugh make:seeder posts

lugh migration:run
lugh migration:rollback [--all]
lugh migration:refresh          # replay down() then up()
lugh migration:fresh            # DROP every table, then up()
lugh migration:status
lugh db:seed [--class name]

lugh list:routes
lugh dev                        # watch + reload
lugh serve
\`\`\`
${
  o.auth
    ? `
## Auth

\`\`\`bash
curl -X POST localhost:3000/api/auth/register -H 'content-type: application/json' \\
  -d '{"name":"Ada","email":"ada@example.com","password":"correct horse"}'

curl -X POST localhost:3000/api/auth/login -H 'content-type: application/json' \\
  -d '{"email":"ada@example.com","password":"correct horse"}'

curl localhost:3000/api/auth/me -H "authorization: Bearer <token>"
\`\`\`

\`JWT_SECRET\` has no default, so the app refuses to boot without one.
`
    : ''
}`
}

// ─────────────────────────────────────────────────────────────────────────────
// scaffolder
// ─────────────────────────────────────────────────────────────────────────────

export interface ScaffoldResult {
  root: string
  files: string[]
  options: ScaffoldOptions
}

/** Writes a complete, runnable project into `<cwd>/<name>`. */
export function scaffoldProject(cwd: string, o: ScaffoldOptions): ScaffoldResult {
  assertValidProjectName(o.name)
  const root = path.join(cwd, o.name)

  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) {
    throw new Error(`[lugh] ${root} already exists and is not empty`)
  }

  const e = ext(o.language)
  const secret = crypto.randomBytes(32).toString('base64url')
  const files: Array<[string, string]> = [
    ['package.json', packageJson(o)],
    ['.gitignore', GITIGNORE],
    ['.env', envFile(o, secret)],
    ['.env.example', envFile(o, 'replace-me-with-a-long-random-string')],
    ['README.md', readme(o)],

    [`config/env.${e}`, configEnv(o)],
    [`config/app.${e}`, configApp(o)],
    [`config/database.${e}`, configDatabase(o)],

    [`app/controllers/post_controller.${e}`, postController(o)],
    [`app/services/post_service.${e}`, postService(o)],
    [`app/models/post.${e}`, postModel(o)],
    [`app/middleware/010_schemas.${e}`, schemasMiddleware(o)],
    [`app/middleware/020_request_logger.${e}`, requestLogger(o)],

    [`database/migrations/${timestamp(new Date(2025, 0, 1, 0, 0, 1))}_create_posts.${e}`, postsMigration(o.language)],
    [`database/seeders/0001_seed_posts.${e}`, seeder(o.language)],

    [`start/routes.${e}`, startRoutes(o)],
    [`start/server.${e}`, startServer(o)],
  ]

  if (o.language === 'ts') files.push(['tsconfig.json', TSCONFIG])

  if (o.auth) {
    files.push(
      [`app/middleware/005_security.${e}`, securityMiddleware(o)],
      [`app/middleware/auth.${e}`, authMiddleware(o)],
      [`app/controllers/auth_controller.${e}`, authController(o)],
      [`app/services/auth_service.${e}`, authService(o)],
      [`app/models/user.${e}`, userModel(o)],
      [
        `database/migrations/${timestamp(new Date(2025, 0, 1, 0, 0, 0))}_create_users.${e}`,
        usersMigration(o.language),
      ],
    )
  }

  for (const [rel, content] of files) write(path.join(root, rel), content)

  return { root, files: files.map(([rel]) => rel).sort(), options: o }
}
