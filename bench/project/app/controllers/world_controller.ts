import type { LughReply } from '@lughjs/core'
import WorldService from '../services/world_service.js'

export default class WorldController {
  constructor(private readonly worldService: WorldService) {}

  async random(_request: unknown, reply: LughReply) {
    const row = await this.worldService.random()
    reply.header('content-type', 'application/json')
    return row
  }
}
