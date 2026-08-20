import type { Knex } from 'knex'

export async function seed(knex: Knex): Promise<void> {
  await knex('users').del()
  await knex('posts').del()

  const users = await knex('users')
    .insert([
      { name: 'Ada Lovelace', email: 'ada@example.com' },
      { name: 'Alan Turing', email: 'alan@example.com' },
      { name: 'Grace Hopper', email: 'grace@example.com' },
    ])
    .returning('id')

  await knex('posts').insert([
    { user_id: users[0].id, title: 'Notes on the Analytical Engine', body: 'The engine can weave algebraical patterns just as the Jacquard loom weaves flowers and leaves.' },
    { user_id: users[0].id, title: 'A Sketch of the Analytical Engine', body: 'A detailed exposition of the first general-purpose computer.' },
    { user_id: users[1].id, title: 'Computing Machinery and Intelligence', body: 'Can machines think? The imitation game.' },
    { user_id: users[1].id, title: 'On Computable Numbers', body: 'An application of the Entscheidungsproblem.' },
    { user_id: users[2].id, title: 'The Compiler', body: 'A program that translates source code into machine code.' },
  ])
}
