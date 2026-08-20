import Post from '../models/post.js'

export interface PostInput {
  title: string
  body: string
}

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

  async update(id: number, input: PostInput) {
    await Post.query().patch({ title: input.title, body: input.body }).where('id', id)
    return this.find(id)
  }

  async destroy(id: number): Promise<boolean> {
    const deleted = await Post.query().deleteById(id)
    return deleted > 0
  }
}
