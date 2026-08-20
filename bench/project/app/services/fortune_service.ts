import type { Knex } from 'knex'
import { renderFortunesHtml } from '../views/fortunes.js'

interface FortuneRow {
  id: number
  message: string
}

export default class FortuneService {
  constructor(private readonly db: Knex) {}

  async html() {
    const rows = await this.db<FortuneRow>('fortune').select('id', 'message')
    return renderFortunesHtml(rows)
  }
}
