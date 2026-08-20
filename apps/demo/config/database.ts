import path from 'node:path'
import type { Knex } from 'knex'

export default {
  client: 'better-sqlite3',
  connection: {
    filename: path.join(process.cwd(), process.env.DB_FILE ?? './database/app.sqlite'),
  },
  useNullAsDefault: true,
  pool: { min: 1, max: 1 },
  migrations: {
    directory: path.join(process.cwd(), 'database', 'migrations'),
  },
  seeds: {
    directory: path.join(process.cwd(), 'database', 'seeders'),
  },
} satisfies Knex.Config
