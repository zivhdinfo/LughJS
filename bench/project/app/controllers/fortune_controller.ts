import type { LughReply } from '@lughjs/core'
import FortuneService from '../services/fortune_service.js'

export default class FortuneController {
  constructor(private readonly fortuneService: FortuneService) {}

  async index(_request: unknown, reply: LughReply) {
    const html = await this.fortuneService.html()
    reply.header('content-type', 'text/html; charset=utf-8')
    return html
  }
}
