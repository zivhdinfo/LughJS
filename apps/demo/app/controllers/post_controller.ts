import type { LughRequest, LughReply } from '@lughjs/core'
import PostService, { type PostInput } from '../services/post_service.js'

export default class PostController {
  constructor(private readonly postService: PostService) {}

  async index(_request: LughRequest, _reply: LughReply) {
    return this.postService.all()
  }

  async show(request: LughRequest, reply: LughReply) {
    const post = await this.postService.find(idOf(request))
    if (!post) return reply.code(404).send({ message: 'Post not found' })
    return post
  }

  async store(request: LughRequest, reply: LughReply) {
    const { sub } = request.user as { sub: number }
    const post = await this.postService.create(Number(sub), request.body as PostInput)
    reply.code(201)
    return post
  }

  async update(request: LughRequest, reply: LughReply) {
    const post = await this.postService.update(idOf(request), request.body as PostInput)
    if (!post) return reply.code(404).send({ message: 'Post not found' })
    return post
  }

  async destroy(request: LughRequest, reply: LughReply) {
    const ok = await this.postService.destroy(idOf(request))
    if (!ok) return reply.code(404).send({ message: 'Post not found' })
    reply.code(204)
    return reply.send()
  }
}

const idOf = (request: LughRequest) => Number((request.params as { id: string }).id)
