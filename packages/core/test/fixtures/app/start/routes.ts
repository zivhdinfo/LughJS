import { Route } from '@lughjs/core'
import type { LughReply } from '@lughjs/core'

const postSchema = {
  body: {
    type: 'object',
    required: ['title', 'body'],
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 255 },
      body: { type: 'string', minLength: 1 },
    },
  },
}

const scopedHook = async (_request: unknown, reply: LughReply) => {
  reply.header('x-scoped', 'yes')
}

export default function routes() {
  Route.get('/health', async () => ({ status: 'ok' }))

  Route.get('/posts', 'PostsController.index')
  Route.post('/posts', 'PostsController.store').schema(postSchema)
  Route.get('/posts/:id', 'PostsController.show')
  Route.delete('/posts/:id', 'PostsController.destroy')

  Route.get('/scoped', async () => ({ ok: true })).middleware(scopedHook)

  Route.get('/boom', async () => {
    throw new Error('kaboom')
  })

  // Slow route used by the graceful-shutdown drain test.
  Route.get('/slow', async () => {
    await new Promise((r) => setTimeout(r, 500))
    return { done: true }
  })

  // Route group: every child inherits the prefix.
  Route.group('/api/v1', () => {
    Route.get('/ping', async () => ({ pong: true }))
  })
}
