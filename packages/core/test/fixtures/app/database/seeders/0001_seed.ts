import type { Knex } from 'knex'

export async function seed(knex: Knex): Promise<void> {
  await knex('posts').insert([
    { title: 'seeded post one', body: 'from seeder' },
    { title: 'seeded post two', body: 'from seeder' },
  ])
}
