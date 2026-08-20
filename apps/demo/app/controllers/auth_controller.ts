import type { LughReply, LughRequest } from '@lughjs/core'
import AuthService from '../services/auth_service.js'

export default class AuthController {
  constructor(private readonly authService: AuthService) {}

  async register(request: LughRequest, reply: LughReply) {
    const body = request.body as { name: string; email: string; password: string }
    const user = await this.authService.register(body)
    reply.code(201)
    return user
  }

  async login(request: LughRequest, reply: LughReply) {
    const body = request.body as { email: string; password: string }
    const user = await this.authService.verify(body.email, body.password)
    // Claims stay minimal — an id is enough to look the user up again, and
    // nothing in the token needs re-issuing when the profile changes.
    const token = await reply.jwtSign({ sub: user.id })
    return { token, user }
  }

  async me(request: LughRequest, reply: LughReply) {
    const { sub } = request.user as { sub: number }
    const user = await this.authService.findById(Number(sub))
    if (!user) return reply.code(404).send({ message: 'User not found' })
    return user
  }
}
