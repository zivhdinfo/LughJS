import type { Knex } from 'knex'

interface PostRow {
  id: number
  user_id: number | null
  title: string
  body: string
}

export default class PostsService {
  constructor(private readonly db: Knex) {}

  all() {
    return this.db<PostRow>('posts').orderBy('id', 'desc')
  }

  create(input: { user_id?: number; title: string; body: string }) {
    return this.db<PostRow>('posts').insert(input).returning('*').then((rows) => rows[0])
  }
}
