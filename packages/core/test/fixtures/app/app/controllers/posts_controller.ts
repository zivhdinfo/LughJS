import PostsService from '../services/posts_service'

export default class PostsController {
  constructor(private readonly postsService: PostsService) {}

  async index() {
    return this.postsService.all()
  }

  async store(request: { body: { title: string; body: string } }, reply: { code: (c: number) => { send: (v: unknown) => unknown } }) {
    const row = await this.postsService.create(request.body)
    return reply.code(201).send(row)
  }

  async show(request: { params: { id: string } }, reply: { code: (c: number) => { send: (v: unknown) => unknown } }) {
    const row = await this.postsService.find(Number(request.params.id))
    if (!row) return reply.code(404).send({ message: 'Post not found' })
    return row
  }

  async destroy(request: { params: { id: string } }, reply: { code: (c: number) => { send: (v: unknown) => unknown } }) {
    const ok = await this.postsService.destroy(Number(request.params.id))
    if (!ok) return reply.code(404).send({ message: 'Post not found' })
    return reply.code(204).send()
  }
}
