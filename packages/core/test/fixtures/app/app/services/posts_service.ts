import type { Knex } from 'knex'

interface PostRow {
  id: number
  title: string
  body: string
}

export default class PostsService {
  constructor(private readonly db: Knex) {}

  all() {
    return this.db<PostRow>('posts').orderBy('id', 'desc')
  }

  find(id: number) {
    return this.db<PostRow>('posts').where({ id }).first()
  }

  create(input: { title: string; body: string }) {
    return this.db<PostRow>('posts').insert(input).returning('*').then((rows) => rows[0])
  }

  async destroy(id: number) {
    const deleted = await this.db('posts').where({ id }).del()
    return deleted > 0
  }
}
