import { Route } from '@lughjs/core'
import { auth } from '../app/middleware/auth.js'

const postBody = {
  type: 'object',
  required: ['title', 'body'],
  additionalProperties: false,
  properties: {
    // `user_id` is deliberately NOT accepted from the client — the author is
    // taken from the authenticated token, so nobody can post as someone else.
    title: { type: 'string', minLength: 1, maxLength: 255 },
    body: { type: 'string', minLength: 1 },
  },
}

const postSchema = {
  body: postBody,
  response: { 200: { $ref: 'post#' }, 201: { $ref: 'post#' } },
}

const registerSchema = {
  body: {
    type: 'object',
    required: ['name', 'email', 'password'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 255 },
      email: { type: 'string', format: 'email', maxLength: 255 },
      password: { type: 'string', minLength: 8, maxLength: 128 },
    },
  },
  response: { 201: { $ref: 'user#' } },
}

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 1 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: { token: { type: 'string' }, user: { $ref: 'user#' } },
    },
  },
}

export default function routes(): void {
  Route.get('/health', async () => ({ status: 'ok' }))

  Route.group('/api', () => {
    Route.post('/auth/register', 'AuthController.register').schema(registerSchema)
    Route.post('/auth/login', 'AuthController.login').schema(loginSchema)
    Route.get('/auth/me', 'AuthController.me').middleware(auth).schema({ response: { 200: { $ref: 'user#' } } })

    // Reads are public; anything that writes requires a valid token.
    Route.get('/posts', 'PostController.index').schema({ response: { 200: { type: 'array', items: { $ref: 'post#' } } } })
    Route.get('/posts/:id', 'PostController.show').schema({ response: { 200: { $ref: 'post#' } } })
    Route.post('/posts', 'PostController.store').middleware(auth).schema(postSchema)
    Route.put('/posts/:id', 'PostController.update').middleware(auth).schema(postSchema)
    Route.patch('/posts/:id', 'PostController.update').middleware(auth).schema(postSchema)
    Route.delete('/posts/:id', 'PostController.destroy').middleware(auth)

    Route.get('/users', 'UserController.index').schema({ response: { 200: { type: 'array', items: { $ref: 'userWithPosts#' } } } })
    Route.get('/users/:id', 'UserController.show').schema({ response: { 200: { $ref: 'userWithPosts#' } } })
    Route.get('/users/:id/posts', 'UserController.posts').schema({
      response: { 200: { type: 'array', items: { $ref: 'post#' } } },
    })
  })
}
