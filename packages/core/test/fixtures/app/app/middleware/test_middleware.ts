import type { LughServer, LughReply } from '@lughjs/core'

export default async function testMiddleware(app: LughServer): Promise<void> {
  app.addHook('onRequest', async (_request, reply: LughReply) => {
    reply.header('x-test-middleware', 'applied')
  })
}
