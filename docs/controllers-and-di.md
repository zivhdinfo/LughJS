# Controllers, services and dependency injection

## The shape of a controller

A controller is a class with a default export. Its methods receive the request
and the reply directly. There is no wrapper object and no `ctx`.

```ts
import type { LughRequest, LughReply } from '@lughjs/core'
import PostService from '../services/post_service.js'

export default class PostController {
  constructor(private readonly postService: PostService) {}

  async index(_request: LughRequest, _reply: LughReply) {
    return this.postService.all()
  }

  async store(request: LughRequest, reply: LughReply) {
    const post = await this.postService.create(request.body as PostInput)
    reply.code(201)
    return post
  }
}
```

Returning a value sends it. `reply.code()` sets the status. Streaming, taking
over the socket, setting headers. All of it works, because the objects are the
real ones and nothing has been narrowed on the way in.

## How injection resolves

The container runs in Awilix's CLASSIC mode: **constructor parameter names are
matched against registration keys.** No decorators, no `reflect-metadata`.

```
app/services/post_service.ts   →  key `postService`
app/controllers/post_controller.ts → key `postController`

constructor(private readonly postService: PostService)
                              ^^^^^^^^^^^ this name is the lookup
```

Rename the parameter and resolution breaks: the type annotation is not what is
matched. This is the one place where a name is load-bearing.

Three keys are always available:

| key | value |
|---|---|
| `db` | the Knex instance |
| `config` | the object exported by `config/app` |
| `env` | the validated environment |

```ts
export default class ReportService {
  constructor(
    private readonly db: Knex,
    private readonly config: AppConfig,
  ) {}
}
```

A file in `app/services` or `app/controllers` that maps to one of those keys is
a boot error, as is two files mapping to the same key.

## Everything is a singleton, resolved at boot

Services and controllers are registered with `.singleton()` and resolved while
the app boots. By the time a request arrives, the route handler is a bound
method on an object that already exists. There is no container lookup, no
proxy, and no per-request allocation from the DI layer.

The practical consequence: **a service instance is shared across all requests.**
Do not store per-request state on `this`. Anything request-scoped belongs on the
request, in an argument, or in `AsyncLocalStorage`.

## Services

A service holds the logic. It is a plain class; nothing about it is special.

```ts
import Post from '../models/post.js'

export interface PostInput {
  title: string
  body: string
}

export default class PostService {
  all() {
    return Post.query().withGraphFetched('author').orderBy('id', 'desc')
  }

  create(authorId: number, input: PostInput) {
    return Post.query().insert({ user_id: authorId, title: input.title, body: input.body })
  }
}
```

### Read the columns you mean

`create(input)` where `input` is `request.body` is mass assignment: whatever the
client sends is what gets inserted. Even with `additionalProperties: false` in
the schema, the moment someone widens the schema the service starts writing
columns nobody intended.

Name the fields:

```ts
create(authorId: number, input: PostInput) {
  return Post.query().insert({ user_id: authorId, title: input.title, body: input.body })
}
```

Note that `authorId` comes from the verified token, not from the body, so a
client cannot attribute a row to somebody else. The generated service templates
carry a comment saying exactly this.

## Generating the files

```bash
lugh make:controller Post
lugh make:service Post
lugh make:model Post
```

The generators emit TypeScript or JavaScript depending on the project, which is
detected by whether `config/app.ts` or `config/app.js` exists. A name that
cannot form a valid class, such as `2fa` or `---`, is rejected rather than written out
as a file that will not parse.
