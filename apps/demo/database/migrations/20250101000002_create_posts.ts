import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('posts', (table) => {
    table.increments('id')
    table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    table.string('title', 255).notNullable()
    table.text('body').notNullable()
    table.timestamps(true, true)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('posts')
}
