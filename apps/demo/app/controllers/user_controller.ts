import type { LughRequest, LughReply } from '@lughjs/core'
import UserService from '../services/user_service.js'

export default class UserController {
  constructor(private readonly userService: UserService) {}

  async index(_request: LughRequest, _reply: LughReply) {
    return this.userService.all()
  }

  async show(request: LughRequest, reply: LughReply) {
    const user = await this.userService.find(Number((request.params as { id: string }).id))
    if (!user) return reply.code(404).send({ message: 'User not found' })
    return user
  }

  async posts(request: LughRequest, _reply: LughReply) {
    return this.userService.postsOf(Number((request.params as { id: string }).id))
  }
}
