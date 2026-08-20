import fs from 'node:fs'
import path from 'node:path'
import { toCamelCase } from './container.js'

export type Language = 'ts' | 'js'

const PAD = (n: number) => String(n).padStart(2, '0')

/**
 * `YYYYMMDDHHmmssSSS` — millisecond resolution.
 *
 * Second resolution used to collide when two `make:migration` calls landed in
 * the same second, producing two files knex would order arbitrarily.
 */
export function timestamp(date = new Date()): string {
  return (
    `${date.getFullYear()}${PAD(date.getMonth() + 1)}${PAD(date.getDate())}` +
    `${PAD(date.getHours())}${PAD(date.getMinutes())}${PAD(date.getSeconds())}` +
    String(date.getMilliseconds()).padStart(3, '0')
  )
}

/** `PostsController` / `postsController` -> `posts_controller`. */
export function snakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .join('_')
    .toLowerCase()
}

/** `post_comment` -> `PostComment`. */
export function pascalCase(name: string): string {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

/**
 * Naive English pluralisation, enough for table names.
 *
 * A word that already ends in a lone `s` is returned unchanged, so calling this
 * on an existing table name (`posts`) cannot produce `postses`.
 */
export function pluralize(word: string): string {
  if (!word) return word
  if (/[^s]s$/i.test(word)) return word
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`
  if (/(f|fe)$/i.test(word)) return word.replace(/fe?$/i, 'ves')
  return `${word}s`
}

/**
 * Rejects names that cannot become a valid JS identifier / class name, so a
 * generator failure surfaces immediately instead of emitting a file that will
 * not parse.
 */
export function assertGeneratableName(name: string): void {
  const pascal = pascalCase(name)
  if (!pascal) {
    throw new Error(`[lugh] "${name}" contains no letters or digits to build a name from`)
  }
  if (!/^[A-Za-z_$]/.test(pascal)) {
    throw new Error(`[lugh] "${name}" produces the invalid class name "${pascal}" — it must not start with a digit`)
  }
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

export function writeIfAbsent(file: string, content: string): 'created' | 'exists' {
  if (fs.existsSync(file)) return 'exists'
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, content, 'utf8')
  return 'created'
}

/** Overwrites unconditionally; used by the project scaffolder on a fresh dir. */
export function write(file: string, content: string): void {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, content, 'utf8')
}

/** Strips TypeScript-only syntax the templates use, for `--language js`. */
function ts(lang: Language, code: string): string {
  return lang === 'ts' ? code : ''
}

export const controllerTemplate = (name: string, lang: Language = 'ts'): string => {
  assertGeneratableName(name)
  const cls = `${pascalCase(name)}Controller`
  const serviceFile = `${snakeCase(name)}_service`
  const ServiceType = `${pascalCase(name)}Service`
  // The constructor parameter NAME is what the container matches on.
  const prop = toCamelCase(serviceFile)

  const imports =
    lang === 'ts'
      ? `import type { LughRequest, LughReply } from '@lughjs/core'\nimport ${ServiceType} from '../services/${serviceFile}.js'\n`
      : `import ${ServiceType} from '../services/${serviceFile}.js'\n`

  const ctor =
    lang === 'ts'
      ? `  constructor(private readonly ${prop}: ${ServiceType}) {}`
      : `  #${prop}\n\n  constructor(${prop}) {\n    this.#${prop} = ${prop}\n  }`

  const self = lang === 'ts' ? `this.${prop}` : `this.#${prop}`
  const req = (n: string) => (lang === 'ts' ? `${n}: LughRequest` : n)
  const rep = (n: string) => (lang === 'ts' ? `${n}: LughReply` : n)
  const idOf = lang === 'ts' ? `Number((request.params as { id: string }).id)` : `Number(request.params.id)`
  const bodyOf = lang === 'ts' ? `request.body as Record<string, unknown>` : `request.body`

  return `${imports}
export default class ${cls} {
${ctor}

  async index(${req('request')}, ${rep('reply')}) {
    return ${self}.all()
  }

  async store(${req('request')}, ${rep('reply')}) {
    const row = await ${self}.create(${bodyOf})
    reply.code(201)
    return row
  }

  async show(${req('request')}, ${rep('reply')}) {
    const row = await ${self}.find(${idOf})
    if (!row) return reply.code(404).send({ message: 'Not found' })
    return row
  }

  async update(${req('request')}, ${rep('reply')}) {
    const row = await ${self}.update(${idOf}, ${bodyOf})
    if (!row) return reply.code(404).send({ message: 'Not found' })
    return row
  }

  async destroy(${req('request')}, ${rep('reply')}) {
    await ${self}.destroy(${idOf})
    reply.code(204)
    return reply.send()
  }
}
`
}

export const modelTemplate = (name: string, lang: Language = 'ts'): string => {
  assertGeneratableName(name)
  const cls = pascalCase(name)
  const table = pluralize(snakeCase(name))
  // `override` is required under noImplicitOverride, which the scaffolded
  // tsconfig enables; it is invalid syntax in a .js file.
  const ovr = lang === 'ts' ? 'override ' : ''
  return `import { BaseModel } from '@lughjs/core'

export default class ${cls} extends BaseModel {
  static ${ovr}tableName = '${table}'
}
`
}

export const serviceTemplate = (name: string, lang: Language = 'ts'): string => {
  assertGeneratableName(name)
  const cls = `${pascalCase(name)}Service`
  const modelFile = snakeCase(name)
  const Model = pascalCase(name)

  const imports =
    lang === 'ts'
      ? `import type { Knex } from 'knex'\nimport ${Model} from '../models/${modelFile}.js'\n`
      : `import ${Model} from '../models/${modelFile}.js'\n`

  const ctor = lang === 'ts' ? `  constructor(private readonly db: Knex) {}` : `  constructor(db) {\n    this.db = db\n  }`
  const input = lang === 'ts' ? `input: Record<string, unknown>` : `input`
  const id = lang === 'ts' ? `id: number` : `id`

  return `${imports}
export default class ${cls} {
${ctor}

  all() {
    return ${Model}.query()
  }

  find(${id}) {
    return ${Model}.query().findById(id)
  }

  // Whitelist the columns a client may set before calling this from a
  // controller — passing a request body straight through is mass assignment.
  create(${input}) {
    return ${Model}.query().insert(input)
  }

  async update(${id}, ${input}) {
    await ${Model}.query().patch(input).where('id', id)
    return this.find(id)
  }

  async destroy(${id}) {
    await ${Model}.query().deleteById(id)
  }
}
`
}

/**
 * Derives the table name from a migration name.
 *
 * Only a LEADING verb and a trailing `_table` are stripped. The previous
 * implementation removed those words anywhere in the string, so
 * `create_addresses` became `resses`.
 */
export function tableFromMigrationName(name: string): string {
  let table = snakeCase(name)
  table = table.replace(/^(create|add|drop|alter|rename|update|remove)_/, '')
  table = table.replace(/_table$/, '')
  return table || snakeCase(name)
}

export const migrationTemplate = (name: string, lang: Language = 'ts'): string => {
  const table = tableFromMigrationName(name)
  const sig = lang === 'ts' ? `(knex: Knex): Promise<void>` : `(knex)`
  const imports = ts(lang, `import type { Knex } from 'knex'\n\n`)
  return `${imports}export async function up${sig} {
  await knex.schema.createTable('${table}', (table) => {
    table.increments('id')
    table.timestamps(true, true)
  })
}

export async function down${sig} {
  await knex.schema.dropTableIfExists('${table}')
}
`
}

export const seederTemplate = (name: string, lang: Language = 'ts'): string => {
  // A seeder is named after the table it seeds (`make:seeder posts`), so the
  // name is used as given rather than pluralised again.
  const table = snakeCase(name)
  const sig = lang === 'ts' ? `(knex: Knex): Promise<void>` : `(knex)`
  const imports = ts(lang, `import type { Knex } from 'knex'\n\n`)
  return `${imports}export async function seed${sig} {
  // Idempotent by convention: clear the table first, then insert.
  await knex('${table}').del()
  await knex('${table}').insert([
    // { column: 'value' },
  ])
}
`
}
