import type { Knex } from 'knex'

export default {
  client: 'better-sqlite3',
  connection: { filename: ':memory:' },
  useNullAsDefault: true,
  pool: { min: 1, max: 1 },
} satisfies Knex.Config
