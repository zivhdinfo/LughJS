import type { LughReply, LughRequest } from '@lughjs/core'
import PostsService from '../services/posts_service.js'

export default class PostsController {
  constructor(private readonly postsService: PostsService) {}

  async index(_request: LughRequest, _reply: LughReply) {
    return this.postsService.all()
  }

  async store(request: LughRequest, reply: LughReply) {
    const post = await this.postsService.create(request.body as { user_id?: number; title: string; body: string })
    reply.code(201)
    return post
  }
}
