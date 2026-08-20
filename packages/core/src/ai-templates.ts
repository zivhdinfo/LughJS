// Instructions written into a scaffolded project for AI coding assistants.
//
// The content is assembled from arrays of lines rather than template literals
// because almost every line contains a backtick, and escaping each one inside a
// template literal makes the source unreadable and easy to break.
//
// What goes in here is only what an assistant cannot infer from the code in
// front of it: the conventions the framework enforces at boot, and the mistakes
// that look correct until the second boot or the first hostile request.
import type { AiChoice, DatabaseChoice, ScaffoldOptions } from './scaffold.js'
import type { Language } from './generators.js'

const DB_LABEL: Record<DatabaseChoice, string> = {
  sqlite: 'SQLite via better-sqlite3',
  postgres: 'PostgreSQL via pg',
  mysql: 'MySQL or MariaDB via mysql2',
}

/** Which files a given choice produces. */
export function aiFiles(o: ScaffoldOptions): Array<[string, string]> {
  const files: Array<[string, string]> = []
  if (o.ai === 'agents' || o.ai === 'both') {
    files.push(['AGENTS.md', agentsMarkdown(o)])
  }
  if (o.ai === 'claude' || o.ai === 'both') {
    files.push(['CLAUDE.md', claudeMarkdown(o)])
    files.push(['.claude/settings.json', claudeSettings(o)])
    for (const [rel, content] of skillFiles(o)) files.push([rel, content])
  }
  return files
}

function ext(lang: Language): string {
  return lang === 'ts' ? 'ts' : 'js'
}

/** The conventions section, shared by every generated instruction file. */
function conventions(o: ScaffoldOptions): string[] {
  const e = ext(o.language)
  const L: string[] = []

  L.push('## Layout')
  L.push('')
  L.push('```')
  L.push('app/controllers   HTTP entry points, given the request and reply directly')
  L.push('app/services      business logic, injected into controllers by parameter name')
  L.push('app/models        Objection models')
  L.push('app/middleware    global hooks, registered at boot in file-name order')
  L.push('config/           env specs, app config, database config')
  L.push('database/         migrations and seeders')
  L.push('start/routes.' + e + '    the route table')
  L.push('start/server.' + e + '    entry point')
  L.push('```')
  L.push('')
  L.push('Only those folders are conventional. Anything else you add is ordinary')
  L.push('code that the framework never scans.')
  L.push('')

  L.push('## Rules the framework enforces')
  L.push('')
  L.push('These are not style preferences. Breaking one fails the boot, or fails')
  L.push('silently in a way that is hard to trace.')
  L.push('')
  L.push('**The route table lives inside the default-exported function.** A module')
  L.push('body runs once per process, so a `Route.get(...)` at the top level of')
  L.push('`start/routes.' + e + '` registers on the first boot and vanishes on the second,')
  L.push('which is what a test, a benchmark or a reload does.')
  L.push('')
  L.push('**A file name is a container key.** `app/services/post_service.' + e + '`')
  L.push('registers as `postService`, and a constructor parameter of that name')
  L.push('receives it. The parameter NAME is what is matched, never the type. Renaming')
  L.push('the parameter breaks injection. `db`, `config` and `env` are registered for')
  L.push('you, so a parameter with one of those names gets it.')
  L.push('')
  L.push('**Two files must not map to the same key.** `post_service.' + e + '` and')
  L.push('`PostService.' + e + '` both become `postService`, and the second one fails the boot.')
  L.push('')
  L.push('**A middleware file with a default export is global.** Files in')
  L.push('`app/middleware` load in sorted file-name order, which is why they are')
  L.push('numbered `005_`, `010_`, `020_`. A file with NO default export is left alone')
  L.push('on purpose: that is how a per-route guard is written, imported by name in')
  L.push('`start/routes.' + e + '` and attached with `.middleware(...)`.')
  L.push('')
  L.push('**A guard must return the reply.** An `onRequest` hook that sends a reply')
  L.push('without returning it does not stop the request, and the handler then runs')
  L.push('against a reply that has already been sent.')
  L.push('')
  L.push('**Everything expensive happens at boot.** Config, the pool, services,')
  L.push('schemas and controller bindings are resolved once. Do not add per-request')
  L.push('container lookups, per-request schema compilation or per-request config')
  L.push('reads. If something can be settled before traffic arrives, settle it there.')
  L.push('')

  L.push('## Writing a handler safely')
  L.push('')
  L.push('**Never pass a request body straight into `insert()` or `patch()`.** That is')
  L.push('mass assignment: whatever the client sends is what gets written. Name the')
  L.push('columns, or keep an explicit allow-list.')
  L.push('')
  L.push('```' + o.language)
  if (o.language === 'ts') {
    L.push('// wrong')
    L.push('create(input: Record<string, unknown>) {')
    L.push('  return Post.query().insert(input)')
    L.push('}')
    L.push('')
    L.push('// right')
    L.push('create(input: { title: string; body: string }) {')
    L.push('  return Post.query().insert({ title: input.title, body: input.body })')
    L.push('}')
  } else {
    L.push('// wrong')
    L.push('create(input) {')
    L.push('  return Post.query().insert(input)')
    L.push('}')
    L.push('')
    L.push('// right')
    L.push('create(input) {')
    L.push('  return Post.query().insert({ title: input.title, body: input.body })')
    L.push('}')
  }
  L.push('```')
  L.push('')
  L.push('**A `response` schema is an allow-list.** Only the properties you list are')
  L.push('serialized, so a column such as a password hash cannot leave the process')
  L.push('even if a query selects it. Declare `response` on any route that returns a')
  L.push('record.')
  L.push('')
  L.push('**`additionalProperties: false` strips, it does not reject.** A body')
  L.push('carrying a field the schema does not list produces a 201, not a 400, and the')
  L.push('handler never sees the field. Do not write a test asserting the 400.')
  L.push('')
  L.push('**Authentication is not authorization.** A guard proves who is calling. It')
  L.push('says nothing about whether they may touch this row. Put the owner check in')
  L.push('the service, and scope it into the statement rather than reading the row')
  L.push('first, so there is no gap between the check and the write:')
  L.push('')
  L.push('```' + o.language)
  L.push('const patched = await Post.query()')
  L.push('  .patch({ title: input.title })')
  L.push("  .where('id', id)")
  L.push("  .andWhere('user_id', actorId)")
  L.push('```')
  L.push('')

  L.push('## Errors')
  L.push('')
  L.push('One shape for the whole application, installed by the framework:')
  L.push('')
  L.push('- a failed schema becomes a 400 with the offending fields in `errors[]`')
  L.push('- an error carrying a 4xx `statusCode` keeps its status and its message')
  L.push('- anything else becomes a 500 with a generic message')
  L.push('')
  L.push('Do not add a handler that forwards an internal error message to the client.')
  L.push('Database drivers put the failing statement, including its bound values, in')
  L.push('`err.message`. To signal a deliberate 4xx, throw an error with a')
  L.push('`statusCode` property.')
  L.push('')

  return L
}

function commands(o: ScaffoldOptions): string[] {
  const L: string[] = []
  L.push('## Commands')
  L.push('')
  L.push('```bash')
  L.push('npm run dev          # watch and reload')
  L.push('npm start            # run the server')
  L.push('npm run migrate      # run pending migrations')
  L.push('npm run seed         # run seeders')
  L.push('npm run routes       # print the route table the server installed')
  if (o.language === 'ts') L.push('npm run typecheck    # tsc --noEmit')
  L.push('```')
  L.push('')
  L.push('Generators, which write a file only if it does not already exist:')
  L.push('')
  L.push('```bash')
  L.push('lugh make:controller Post')
  L.push('lugh make:model Post')
  L.push('lugh make:service Post')
  L.push('lugh make:migration create_posts')
  L.push('lugh make:seeder posts')
  L.push('```')
  L.push('')
  L.push('Migration commands beyond `migrate`:')
  L.push('')
  L.push('```bash')
  L.push('lugh migration:status            # what has run, what is pending')
  L.push('lugh migration:rollback [--all]')
  L.push('lugh migration:refresh           # replay down() then up()')
  L.push('lugh migration:fresh             # DROP every table, then up()')
  L.push('```')
  L.push('')
  L.push('`migration:fresh` is destructive and drops tables no migration owns. Never')
  L.push('run it against anything but a local database.')
  L.push('')
  return L
}

function databaseNotes(o: ScaffoldOptions): string[] {
  const L: string[] = []
  L.push('## Database')
  L.push('')
  L.push('This project uses **' + DB_LABEL[o.database] + '**, configured in')
  L.push('`config/database.' + ext(o.language) + '`. Knex is the query builder and migration runner;')
  L.push('Objection provides models and relations. Neither is wrapped, so their own')
  L.push('documentation applies as written.')
  L.push('')
  L.push('A model extends `BaseModel` and declares its table:')
  L.push('')
  L.push('```' + o.language)
  L.push("import { BaseModel } from '@lughjs/core'")
  L.push('')
  L.push('export default class Post extends BaseModel {')
  if (o.language === 'ts') {
    L.push("  static override tableName = 'posts'")
  } else {
    L.push("  static tableName = 'posts'")
  }
  L.push('}')
  L.push('```')
  if (o.language === 'ts') {
    L.push('')
    L.push('`override` is required because the generated `tsconfig.json` sets')
    L.push('`noImplicitOverride`. Leaving it out is a type error, not a warning.')
  }
  L.push('')
  if (o.database === 'sqlite') {
    L.push('The pool is `{ min: 1, max: 1 }` because concurrent writers to one SQLite')
    L.push('file serialise anyway. SQLite suits development and a single instance; it')
    L.push('does not suit several instances behind a load balancer.')
  } else {
    L.push('The connection reads `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and')
    L.push('`DB_NAME` from the environment. The database itself has to exist before')
    L.push('the first migration runs; the migration creates tables, not the database.')
  }
  L.push('')
  return L
}

function environmentNotes(o: ScaffoldOptions): string[] {
  const L: string[] = []
  L.push('## Environment')
  L.push('')
  L.push('`config/env.' + ext(o.language) + '` is the contract. Every variable the app reads is')
  L.push('declared there with a type, and a missing or malformed one fails the boot')
  L.push('with every offending name listed. When you add a variable, declare it there')
  L.push('as well as putting it in `.env`, or the boot will reject it.')
  L.push('')
  L.push('`.env` is not committed. `.env.example` is the template, and it should be')
  L.push('updated whenever a variable is added.')
  if (o.auth) {
    L.push('')
    L.push('`JWT_SECRET` is declared with no default on purpose, so the app refuses to')
    L.push('boot without one. Never give it a fallback value, and never commit a real')
    L.push('one.')
  }
  L.push('')
  return L
}

function authNotes(o: ScaffoldOptions): string[] {
  if (!o.auth) return []
  const e = ext(o.language)
  const L: string[] = []
  L.push('## Auth')
  L.push('')
  L.push('`app/middleware/005_security.' + e + '` registers helmet, CORS, rate limiting and')
  L.push('JWT verification. It uses `server.register` because those are ecosystem')
  L.push('plugins that publish decorators onto the root instance. A plain hook module')
  L.push('in that folder must NOT use `register`.')
  L.push('')
  L.push('`app/middleware/auth.' + e + '` is the per-route guard. It has no default export,')
  L.push('which is how the framework knows to leave it out of the global chain:')
  L.push('')
  L.push('```' + o.language)
  L.push("import { auth } from '../app/middleware/auth.js'")
  L.push('')
  L.push("Route.post('/posts', 'PostController.store').middleware(auth)")
  L.push('```')
  L.push('')
  L.push('Rules to keep:')
  L.push('')
  L.push('- token claims stay minimal, an id and nothing more, because anything else')
  L.push('  is stale the moment it changes and there is no revocation path')
  L.push('- the author of a row comes from the verified token, never from the body')
  L.push('- CORS uses an explicit origin list; `origin: true` reflects whatever the')
  L.push('  caller sent and is worse than no CORS at all once credentials are involved')
  L.push('- a password hash is never selected into memory, and never listed in a')
  L.push('  response schema')
  L.push('')
  return L
}

function pitfalls(o: ScaffoldOptions): string[] {
  const e = ext(o.language)
  const L: string[] = []
  L.push('## Do not')
  L.push('')
  L.push('- call `Route.get(...)` at the top level of `start/routes.' + e + '`')
  L.push('- pass `request.body` straight into `insert()` or `patch()`')
  L.push('- add a default export to a per-route guard file')
  L.push('- use `server.register` in a plain hook module in `app/middleware`')
  L.push('- run migrations from inside the server process at boot')
  L.push('- forward an internal error message to the client')
  L.push('- read config or resolve from the container inside a request handler')
  if (o.auth) L.push('- give `JWT_SECRET` a default, or commit a real one')
  L.push('')
  return L
}

export function agentsMarkdown(o: ScaffoldOptions): string {
  const L: string[] = []
  L.push('# ' + o.name)
  L.push('')
  L.push('Instructions for AI coding assistants working in this repository.')
  L.push('')
  L.push('This is a [Lugh](https://github.com/zivhdinfo/LughJS) application:')
  L.push(
    (o.language === 'ts' ? 'TypeScript' : 'JavaScript') +
      ', ' +
      DB_LABEL[o.database] +
      (o.auth ? ', with the JWT auth scaffold' : '') +
      '.',
  )
  L.push('')
  L.push('Lugh resolves everything expensive while the process boots, so a mistake')
  L.push('usually shows up as a failed boot rather than a failed request. Read the')
  L.push('rules below before changing routing, middleware or the container.')
  L.push('')
  L.push(...commands(o))
  L.push(...conventions(o))
  L.push(...databaseNotes(o))
  L.push(...environmentNotes(o))
  L.push(...authNotes(o))
  L.push(...pitfalls(o))
  L.push('## Reference')
  L.push('')
  L.push('Framework documentation, if something here is not enough:')
  L.push('<https://github.com/zivhdinfo/LughJS/tree/main/docs>')
  L.push('')
  return L.join('\n')
}

export function claudeMarkdown(o: ScaffoldOptions): string {
  const both = o.ai === 'both'
  const L: string[] = []
  L.push('# ' + o.name)
  L.push('')
  if (both) {
    L.push('Project instructions for Claude Code.')
    L.push('')
    L.push('The conventions this project enforces are in [AGENTS.md](AGENTS.md).')
    L.push('Read that file first; everything in it applies here. This file adds only')
    L.push('what is specific to working through Claude Code.')
    L.push('')
  } else {
    L.push('Project instructions for Claude Code.')
    L.push('')
    L.push('This is a [Lugh](https://github.com/zivhdinfo/LughJS) application:')
    L.push(
      (o.language === 'ts' ? 'TypeScript' : 'JavaScript') +
        ', ' +
        DB_LABEL[o.database] +
        (o.auth ? ', with the JWT auth scaffold' : '') +
        '.',
    )
    L.push('')
    L.push('Lugh resolves everything expensive while the process boots, so a mistake')
    L.push('usually shows up as a failed boot rather than a failed request.')
    L.push('')
    L.push(...commands(o))
    L.push(...conventions(o))
    L.push(...databaseNotes(o))
    L.push(...environmentNotes(o))
    L.push(...authNotes(o))
    L.push(...pitfalls(o))
  }

  L.push('## Skills')
  L.push('')
  L.push('`.claude/skills/` holds task recipes for this project:')
  L.push('')
  L.push('- `lugh-resource`, adding a table plus its model, service, controller and routes')
  L.push('- `lugh-migrations`, writing and running a migration against this database')
  if (o.auth) L.push('- `lugh-auth`, guarding a route and checking ownership')
  L.push('')

  L.push('## Verifying a change')
  L.push('')
  L.push('After changing routing, middleware or the container, boot the app rather')
  L.push('than reasoning about it. Most mistakes in this framework are boot failures')
  L.push('with an explicit message:')
  L.push('')
  L.push('```bash')
  L.push('npm run routes')
  L.push('```')
  L.push('')
  L.push('That prints the table the server actually installed, which is the one to')
  L.push('trust. A route you declared but cannot see there did not register.')
  if (o.language === 'ts') {
    L.push('')
    L.push('Run `npm run typecheck` after touching a model or a service signature.')
  }
  L.push('')
  if (!both) {
    L.push('## Reference')
    L.push('')
    L.push('Framework documentation:')
    L.push('<https://github.com/zivhdinfo/LughJS/tree/main/docs>')
    L.push('')
  }
  return L.join('\n')
}

/**
 * A permission allow-list for the read-only and routine commands of this
 * project, so the assistant is not stopped to confirm each one. Destructive
 * commands are deliberately absent, and `migration:fresh` is denied outright
 * because it drops every table in the schema.
 */
export function claudeSettings(o: ScaffoldOptions): string {
  const allow = [
    'Bash(npm run dev)',
    'Bash(npm run migrate)',
    'Bash(npm run seed)',
    'Bash(npm run routes)',
    'Bash(lugh list:routes)',
    'Bash(lugh migration:status)',
    'Bash(lugh make:*)',
  ]
  if (o.language === 'ts') allow.push('Bash(npm run typecheck)')
  return (
    JSON.stringify(
      {
        permissions: {
          allow,
          deny: ['Bash(lugh migration:fresh)', 'Bash(npm run migrate -- --all)'],
        },
      },
      null,
      2,
    ) + '\n'
  )
}

function skillFiles(o: ScaffoldOptions): Array<[string, string]> {
  const files: Array<[string, string]> = [
    ['.claude/skills/lugh-resource/SKILL.md', resourceSkill(o)],
    ['.claude/skills/lugh-migrations/SKILL.md', migrationSkill(o)],
  ]
  if (o.auth) files.push(['.claude/skills/lugh-auth/SKILL.md', authSkill(o)])
  return files
}

function frontmatter(name: string, description: string): string[] {
  return ['---', 'name: ' + name, 'description: ' + description, '---', '']
}

function resourceSkill(o: ScaffoldOptions): string {
  const e = ext(o.language)
  const L: string[] = []
  L.push(
    ...frontmatter(
      'lugh-resource',
      'Add a complete resource to this Lugh app: migration, model, service, controller and routes. Use when asked to add a new entity, table or CRUD endpoint.',
    ),
  )
  L.push('# Adding a resource')
  L.push('')
  L.push('Five files, in this order. The order matters: the migration has to exist')
  L.push('before the model can be used, and the controller has to exist before a')
  L.push('route can name it.')
  L.push('')
  L.push('## 1. Generate the skeletons')
  L.push('')
  L.push('```bash')
  L.push('lugh make:migration create_widgets')
  L.push('lugh make:model Widget')
  L.push('lugh make:service Widget')
  L.push('lugh make:controller Widget')
  L.push('```')
  L.push('')
  L.push('The generators never overwrite an existing file; they print `SKIP` instead.')
  L.push('')
  L.push('## 2. Fill in the migration')
  L.push('')
  L.push('`database/migrations/<timestamp>_create_widgets.' + e + '` gets an `id` and')
  L.push('timestamps by default. Add the columns, and make `down()` the exact inverse.')
  L.push('')
  L.push('## 3. Fill in the service')
  L.push('')
  L.push('The generated service has an empty `FILLABLE` list and a `pick()` helper.')
  L.push('**List the columns a client may set**, or `create` and `update` write')
  L.push('nothing. This is the mass assignment guard; do not remove it and pass the')
  L.push('body through instead.')
  L.push('')
  L.push('## 4. Declare the routes')
  L.push('')
  L.push('Inside the default-exported function in `start/routes.' + e + '`:')
  L.push('')
  L.push('```' + o.language)
  L.push("Route.group('/api', () => {")
  L.push("  Route.get('/widgets', 'WidgetController.index')")
  L.push("  Route.get('/widgets/:id', 'WidgetController.show')")
  L.push("  Route.post('/widgets', 'WidgetController.store').schema(widgetSchema)")
  L.push('})')
  L.push('```')
  L.push('')
  L.push('`Route.resource(url, controller)` declares the five REST routes in one call')
  L.push('when the controller has `index`, `store`, `show`, `update` and `destroy`.')
  L.push('')
  L.push('## 5. Add the schema')
  L.push('')
  L.push('Validate the body, and declare `response` so the route serializes through an')
  L.push('allow-list. Shared response shapes belong in `app/middleware/010_schemas.' + e + '`')
  L.push('and are referenced with `$ref`.')
  L.push('')
  L.push('## 6. Verify')
  L.push('')
  L.push('```bash')
  L.push('npm run migrate')
  L.push('npm run routes')
  L.push('```')
  L.push('')
  L.push('`npm run routes` boots the whole app, so it catches an unregistered')
  L.push('controller, a duplicate container key and a schema that will not compile.')
  L.push('A route missing from that output did not register.')
  L.push('')
  return L.join('\n')
}

function migrationSkill(o: ScaffoldOptions): string {
  const e = ext(o.language)
  const L: string[] = []
  L.push(
    ...frontmatter(
      'lugh-migrations',
      'Write, run and roll back database migrations in this Lugh app. Use when asked to change the schema, add a column, or fix a migration.',
    ),
  )
  L.push('# Migrations')
  L.push('')
  L.push('This project uses ' + DB_LABEL[o.database] + '.')
  L.push('')
  L.push('## Creating one')
  L.push('')
  L.push('```bash')
  L.push('lugh make:migration add_status_to_widgets')
  L.push('```')
  L.push('')
  L.push('The file name carries a millisecond timestamp, which is what orders the')
  L.push('batch. Do not rename a migration that has already run: the name is the key')
  L.push('in the migrations table, and renaming it makes the runner treat it as new.')
  L.push('')
  L.push('## Writing one')
  L.push('')
  L.push('`up()` and `down()` must be exact inverses. `down()` is what')
  L.push('`migration:rollback` and `migration:refresh` replay, and a `down()` that')
  L.push('forgets a table leaves it behind forever.')
  L.push('')
  L.push('```' + o.language)
  if (o.language === 'ts') {
    L.push('export async function up(knex: Knex): Promise<void> {')
  } else {
    L.push('export async function up(knex) {')
  }
  L.push("  await knex.schema.alterTable('widgets', (table) => {")
  L.push("    table.string('status', 32).notNullable().defaultTo('draft')")
  L.push('  })')
  L.push('}')
  L.push('')
  if (o.language === 'ts') {
    L.push('export async function down(knex: Knex): Promise<void> {')
  } else {
    L.push('export async function down(knex) {')
  }
  L.push("  await knex.schema.alterTable('widgets', (table) => {")
  L.push("    table.dropColumn('status')")
  L.push('  })')
  L.push('}')
  L.push('```')
  L.push('')
  if (o.database === 'sqlite') {
    L.push('SQLite rebuilds the table for most `alterTable` operations, and it cannot')
    L.push('drop a column that an index or a constraint still references. Adding a')
    L.push('`notNullable` column to a table that already has rows needs a `defaultTo`.')
  } else if (o.database === 'postgres') {
    L.push('PostgreSQL runs each migration batch in a transaction, so a failure part')
    L.push('way through rolls the whole batch back. Adding a `notNullable` column to a')
    L.push('populated table needs a `defaultTo` or a three-step migration.')
  } else {
    L.push('MySQL commits DDL implicitly, so a batch that fails part way leaves the')
    L.push('statements that already ran in place. Keep migrations small, and check')
    L.push('`migration:status` after a failure rather than assuming a clean rollback.')
  }
  L.push('')
  L.push('## Running')
  L.push('')
  L.push('```bash')
  L.push('npm run migrate                  # run what is pending')
  L.push('lugh migration:status            # what has run, and when')
  L.push('lugh migration:rollback          # undo the last batch')
  L.push('lugh migration:refresh           # replay down() then up() for everything')
  L.push('```')
  L.push('')
  L.push('`lugh migration:fresh` DROPS every table in the schema, including tables no')
  L.push('migration owns, then re-runs everything. It is for a local database you are')
  L.push('willing to lose. Do not reach for it to fix a failed migration.')
  L.push('')
  L.push('## Seeders')
  L.push('')
  L.push('`database/seeders/` holds them, and the convention is that a seeder is')
  L.push('idempotent: delete from the table, then insert. Run one with')
  L.push('`lugh db:seed --class <name>`.')
  L.push('')
  return L.join('\n')
}

function authSkill(o: ScaffoldOptions): string {
  const e = ext(o.language)
  const L: string[] = []
  L.push(
    ...frontmatter(
      'lugh-auth',
      'Guard a route, read the caller from the token, and check row ownership in this Lugh app. Use when asked to protect an endpoint or restrict access to a record.',
    ),
  )
  L.push('# Auth')
  L.push('')
  L.push('## Guarding a route')
  L.push('')
  L.push('```' + o.language)
  L.push("import { auth } from '../app/middleware/auth.js'")
  L.push('')
  L.push("Route.delete('/widgets/:id', 'WidgetController.destroy').middleware(auth)")
  L.push('```')
  L.push('')
  L.push('`app/middleware/auth.' + e + '` has no default export, which is what keeps it out')
  L.push('of the global middleware chain. Do not add one.')
  L.push('')
  L.push('## Reading the caller')
  L.push('')
  L.push('The token carries `sub`, and nothing else:')
  L.push('')
  L.push('```' + o.language)
  if (o.language === 'ts') {
    L.push('const { sub } = request.user as { sub: number }')
  } else {
    L.push('const { sub } = request.user')
  }
  L.push('```')
  L.push('')
  L.push('Anything derived from the caller, an author id above all, comes from here.')
  L.push('Never from the request body, and never from a query parameter.')
  L.push('')
  L.push('## Checking ownership')
  L.push('')
  L.push('The guard proves who is calling. It says nothing about whether they may')
  L.push('touch this row. Scope the check into the statement rather than reading the')
  L.push('row and then writing it, so two concurrent requests cannot slip between:')
  L.push('')
  L.push('```' + o.language)
  L.push('const deleted = await Widget.query()')
  L.push('  .delete()')
  L.push("  .where('id', id)")
  L.push("  .andWhere('user_id', actorId)")
  L.push('')
  L.push('if (deleted > 0) return true')
  L.push('// Nothing matched. Distinguish the two cases so the caller can answer')
  L.push('// 404 for a row that is not there and 403 for one that is not theirs.')
  L.push('return (await Widget.query().findById(id)) ? false : null')
  L.push('```')
  L.push('')
  L.push('## What not to do')
  L.push('')
  L.push('- do not put the ownership check in the guard; only the service knows what')
  L.push('  owning a row means for that table')
  L.push('- do not add a role or an email to the token, it is stale the moment it')
  L.push('  changes and there is no revocation path')
  L.push('- do not select a password hash into memory, and never list it in a')
  L.push('  response schema')
  L.push('- do not give `JWT_SECRET` a default value')
  L.push('')
  return L.join('\n')
}
