# Database

LughJS uses **Knex** as the query builder and migration runner, and
**Objection** for models and relations. Both are ordinary dependencies, and nothing
is wrapped, so their full APIs are available.

## Configuration

`config/database.ts` exports a plain Knex config:

```ts
import type { Knex } from 'knex'

const config: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
  },
  pool: { min: 2, max: 10 },
}

export default config
```

Any Knex dialect works. `lugh new --database=` generates this file for
`better-sqlite3`, `pg` or `mysql2` and declares the matching driver.

At boot the connection is created and bound to Objection's `Model`, so models
share the app's pool.

## Models

```ts
import { BaseModel } from '@lughjs/core'
import type { RelationMappings } from 'objection'
import User from './user.js'

export default class Post extends BaseModel {
  static override tableName = 'posts'

  id!: number
  user_id!: number
  title!: string
  body!: string

  static get relationMappings(): RelationMappings {
    return {
      author: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: () => User,
        join: { from: 'posts.user_id', to: 'users.id' },
      },
    }
  }
}
```

`BaseModel` is Objection's `Model`. `modelClass: () => User` is a lazy
reference, which is what lets two models point at each other without a circular
import problem.

```ts
Post.query().withGraphFetched('author')
User.query().withGraphFetched('posts')
```

`make:model Post` writes the file with a pluralised table name (`posts`), and
does not double-pluralise a name that is already plural.

## Migrations

```bash
lugh make:migration create_posts
```

```ts
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('posts', (table) => {
    table.increments('id')
    table.integer('user_id').unsigned().references('users.id')
    table.string('title', 255).notNullable()
    table.text('body').notNullable()
    table.timestamps(true, true)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('posts')
}
```

File names are timestamped to the millisecond, so two migrations created in the
same second still order deterministically.

The table name is derived from the migration name by stripping a **leading**
verb and a trailing `_table`: `create_posts` → `posts`,
`create_widgets_table` → `widgets`, `create_addresses` → `addresses`.

### Commands

| command | what it does |
|---|---|
| `migration:run` | run everything pending |
| `migration:rollback` | undo the last batch |
| `migration:rollback --all` | undo every batch |
| `migration:refresh` | roll back all, then re-run |
| `migration:reset` | roll back all, do not re-run |
| `migration:fresh` | **drop every table in the schema**, then re-run |
| `migration:status` | list each migration as completed or pending |

`refresh` and `fresh` are genuinely different. `refresh` replays each
migration's `down()`, so anything a `down()` forgot to drop, or a table created
outside the migration history, survives. `fresh` enumerates the schema and
drops it, then runs the migrations against an empty database. Use `fresh` when
the history has drifted from reality.

`fresh` is implemented per dialect (PostgreSQL `DROP … CASCADE`, MySQL with
foreign-key checks off, SQLite with `pragma foreign_keys = OFF`) and refuses to
run on a dialect it does not know rather than half-dropping the schema.

Each batch runs inside a transaction where the dialect supports it, so a
migration that throws halfway leaves nothing behind.

## Seeders

```bash
lugh make:seeder posts
```

```ts
export async function seed(knex: Knex): Promise<void> {
  await knex('posts').del()
  await knex('posts').insert([
    { title: 'Hello', body: 'First post.' },
  ])
}
```

Deleting first is the convention that keeps a seeder idempotent.

```bash
lugh db:seed
lugh db:seed --class 0001_seed_posts
```

`--class` takes a file name with or without its extension. A partial name is
accepted only when it matches exactly one file; if it matches several the
command fails and lists them rather than picking one.

## Programmatic access

Everything the CLI uses is exported:

```ts
import {
  runMigrations, rollbackMigrations, refreshMigrations,
  freshMigrations, resetMigrations, migrationStatus, runSeeders,
  listTables, dropAllTables,
} from '@lughjs/core'

const [batch, names] = await runMigrations(db, './database/migrations')
```

The migration functions return knex's `[batchNumber, names]` tuple.

## Transactions

Objection and Knex transactions work unchanged:

```ts
await Post.transaction(async (trx) => {
  const post = await Post.query(trx).insert({ title, body })
  await Audit.query(trx).insert({ post_id: post.id })
})
```
