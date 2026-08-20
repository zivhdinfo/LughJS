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
    const result = await this.postService.update(idOf(request), actorOf(request), request.body as PostInput)
    if (result.status === 'missing') return reply.code(404).send({ message: 'Post not found' })
    if (result.status === 'forbidden') return reply.code(403).send({ message: 'Not your post' })
    return result.post
  }

  async destroy(request: LughRequest, reply: LughReply) {
    const result = await this.postService.destroy(idOf(request), actorOf(request))
    if (result === 'missing') return reply.code(404).send({ message: 'Post not found' })
    if (result === 'forbidden') return reply.code(403).send({ message: 'Not your post' })
    reply.code(204)
    return reply.send()
  }
}

const idOf = (request: LughRequest) => Number((request.params as { id: string }).id)

/** The caller's id, taken from the verified token and never from the body. */
const actorOf = (request: LughRequest) => Number((request.user as { sub: number }).sub)
