import type { Knex } from 'knex'

interface WorldRow {
  id: number
  randomNumber: number
}

export default class WorldService {
  constructor(private readonly db: Knex) {}

  random() {
    const id = Math.floor(Math.random() * 10000) + 1
    return this.db<WorldRow>('world').where({ id }).first()
  }
}
