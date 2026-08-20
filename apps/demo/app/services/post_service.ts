import Post from '../models/post.js'

export interface PostInput {
  title: string
  body: string
}

export type UpdateResult =
  | { status: 'ok'; post: Post | undefined }
  | { status: 'forbidden' }
  | { status: 'missing' }

export type DestroyResult = 'ok' | 'forbidden' | 'missing'

export default class PostService {
  all() {
    return Post.query().withGraphFetched('author').orderBy('id', 'desc')
  }

  find(id: number) {
    return Post.query().withGraphFetched('author').findById(id)
  }

  /**
   * `authorId` comes from the verified token, never from the request body, so a
   * client cannot attribute a post to another user.
   */
  create(authorId: number, input: PostInput) {
    return Post.query().insert({ user_id: authorId, title: input.title, body: input.body })
  }

  /**
   * Authentication proves who is calling; it says nothing about whether they
   * may touch this row. The owner check belongs here rather than in the guard,
   * because only the service knows what owning a post means. Both writes scope
   * the statement by `user_id` instead of reading the row first, so two
   * concurrent requests cannot race between the check and the write.
   */
  async update(id: number, actorId: number, input: PostInput): Promise<UpdateResult> {
    const patched = await Post.query()
      .patch({ title: input.title, body: input.body })
      .where('id', id)
      .andWhere('user_id', actorId)

    if (patched > 0) return { status: 'ok', post: await this.find(id) }
    // Nothing matched: either the post does not exist, or it belongs to
    // somebody else. Distinguish the two so the caller can answer 404 vs 403.
    return (await Post.query().findById(id)) ? { status: 'forbidden' } : { status: 'missing' }
  }

  async destroy(id: number, actorId: number): Promise<DestroyResult> {
    const deleted = await Post.query().delete().where('id', id).andWhere('user_id', actorId)
    if (deleted > 0) return 'ok'
    return (await Post.query().findById(id)) ? 'forbidden' : 'missing'
  }
}
