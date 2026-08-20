import type { LughServer } from '@lughjs/core'

/**
 * Shared response schemas, referenced by routes with `$ref`.
 *
 * Declaring the response shape does two jobs at once. It puts serialization on
 * the fast path, and it turns the schema into an allow-list: only the listed
 * properties are emitted, so a column such as `password_hash` cannot reach a
 * client even if a query happens to select it. That is a guarantee about the
 * wire format, not a convention someone has to remember.
 */
export default async function schemas(server: LughServer): Promise<void> {
  server.addSchema({
    $id: 'user',
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      email: { type: 'string' },
      created_at: { type: 'string' },
      updated_at: { type: 'string' },
    },
  })

  server.addSchema({
    $id: 'post',
    type: 'object',
    properties: {
      id: { type: 'integer' },
      user_id: { type: 'integer' },
      title: { type: 'string' },
      body: { type: 'string' },
      created_at: { type: 'string' },
      updated_at: { type: 'string' },
      author: { $ref: 'user#' },
    },
  })

  server.addSchema({
    $id: 'userWithPosts',
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      email: { type: 'string' },
      posts: { type: 'array', items: { $ref: 'post#' } },
    },
  })
}
