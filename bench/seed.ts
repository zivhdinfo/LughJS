import type { Knex } from 'knex'
import { FORTUNES } from './fixtures/fortunes.js'

/** Creates the tables the benchmark suites read from. */
export async function createBenchSchema(db: Knex): Promise<void> {
  await db.schema.createTable('posts', (table) => {
    table.increments('id')
    table.integer('user_id').unsigned()
    table.string('title', 255).notNullable()
    table.text('body').notNullable()
    table.timestamps(true, true)
  })
  await db.schema.createTable('world', (table) => {
    table.integer('id').primary()
    table.integer('randomNumber').notNullable()
  })
  await db.schema.createTable('fortune', (table) => {
    table.integer('id').primary()
    table.string('message', 2048).notNullable()
  })
}

export async function seedBenchData(db: Knex): Promise<void> {
  const world = await db('world').count<{ c: number }>('id as c').first()
  if (!world || Number(world.c) === 0) {
    await db.batchInsert(
      'world',
      // A fixed sequence rather than random values, so two runs read the
      // same rows and are comparable.
      Array.from({ length: 10000 }, (_, i) => ({ id: i + 1, randomNumber: ((i * 7919) % 10000) + 1 })),
      500,
    )
  }

  const fortune = await db('fortune').count<{ c: number }>('id as c').first()
  if (!fortune || Number(fortune.c) === 0) {
    await db.batchInsert(
      'fortune',
      FORTUNES.map(([id, message]) => ({ id, message })),
      500,
    )
  }
}
