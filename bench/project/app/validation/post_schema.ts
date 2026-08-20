/**
 * The schema for the write suite.
 *
 * `response` is declared alongside `body` on purpose: without it the reply
 * falls back to generic serialization, so the suite would be measuring a
 * different code path from the one a real project uses.
 */
export const postSchema = {
  body: {
    type: 'object',
    required: ['title', 'body'],
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 255 },
      body: { type: 'string', minLength: 1 },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        title: { type: 'string' },
        body: { type: 'string' },
      },
    },
  },
} as const
