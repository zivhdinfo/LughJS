import type { Knex } from 'knex'

/**
 * TFB seed: 10,000 world rows (ids 1..10000, randomNumber 1..10000)
 * and the 12 canonical fortunes. Idempotent for bench setup.
 */
export async function seedWorldAndFortune(knex: Knex): Promise<void> {
  const count = await knex('world').count<{ c: number }>('id as c').first()
  if (!count || count.c === 0) {
    await knex.batchInsert('world', Array.from({ length: 10000 }, (_, i) => ({ id: i + 1, randomNumber: Math.floor(Math.random() * 10000) + 1 })), 500)
  }

  const fortuneCount = await knex('fortune').count<{ c: number }>('id as c').first()
  if (!fortuneCount || fortuneCount.c === 0) {
    const { FORTUNES } = await import('../../../fixtures/fortunes.js')
    await knex.batchInsert(
      'fortune',
      FORTUNES.map(([id, message]: readonly [number, string]) => ({ id, message })),
      500,
    )
  }
}
