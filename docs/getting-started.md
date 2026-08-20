# Getting started

## Requirements

Node.js 22 or newer. TypeScript is optional: `lugh new --language=js` produces
a project with no TypeScript anywhere.

## Create a project

```bash
npx @lughjs/core new my-app
```

With no flags the CLI prompts for four things:

```
Project name > (my-app) shop

Language
  1) TypeScript  (default)
  2) JavaScript
> 1

Database
  1) SQLite   (better-sqlite3, zero setup)  (default)
  2) PostgreSQL (pg)
  3) MySQL / MariaDB (mysql2)
> 1

Include the auth scaffold (JWT + bcrypt + users table)? (y/N) > y
```

Every answer has a flag, so the command is scriptable:

```bash
lugh new shop --language=ts --database=postgres --auth
lugh new api  --language=js --database=mysql --no-auth
lugh new demo --yes            # all defaults, no prompts
```

| flag | values | default |
|---|---|---|
| `<name>` | a valid npm package name | `my-app` |
| `--language`, `-l` | `ts`, `js` | `ts` |
| `--database`, `-d` | `sqlite`, `postgres`, `mysql` | `sqlite` |
| `--auth` / `--no-auth` | n/a | no auth |
| `--yes`, `-y` | n/a | prompt |

The scaffolder refuses to write into a directory that already has files in it.

## Run it

```bash
cd shop
npm install
```

For SQLite there is nothing else to configure. For PostgreSQL or MySQL, create
the database named in `.env` (`DB_NAME`) and fill in `DB_USER` / `DB_PASSWORD`.

```bash
npm run migrate     # create the tables
npm run seed        # insert the sample rows
npm run dev         # http://127.0.0.1:3000, watch + reload
```

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/api/posts
```

## With the auth scaffold

`--auth` adds a `users` table, a JWT-signing login flow, bcrypt password
hashing, and guards on the routes that write.

```bash
curl -X POST localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"name":"Ada","email":"ada@example.com","password":"correct horse battery"}'
# → 201 {"id":1,"name":"Ada","email":"ada@example.com","created_at":"…"}

TOKEN=$(curl -sX POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"correct horse battery"}' | jq -r .token)

curl localhost:3000/api/auth/me -H "authorization: Bearer $TOKEN"

curl -X POST localhost:3000/api/posts \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"title":"Hello","body":"World"}'
# → 201; without the header, 401
```

A `JWT_SECRET` is generated into `.env` when the project is created, and
`config/env.ts` declares it with **no default**, so the app refuses to boot if it
is missing rather than falling back to a shared literal. `.env` is gitignored;
`.env.example` carries a placeholder.

## Your first route

`start/routes.ts` is a function, not a list of top-level calls:

```ts
import { Route } from '@lughjs/core'

export default function routes() {
  Route.get('/hello/:name', async (request) => {
    const { name } = request.params as { name: string }
    return { hello: name }
  })
}
```

The function form matters: an ES module is evaluated once per process, so
top-level `Route.get(...)` calls would register nothing on a second boot: in a
test, a benchmark, or a reload. `createApp` rejects a routes file that does not
default-export a function.

## Add a resource

```bash
lugh make:model Comment        # app/models/comment.ts        (table: comments)
lugh make:service Comment      # app/services/comment_service.ts
lugh make:controller Comment   # app/controllers/comment_controller.ts
lugh make:migration create_comments
```

Then wire it up:

```ts
Route.group('/api', () => {
  Route.get('/comments', 'CommentController.index')
  Route.post('/comments', 'CommentController.store').schema(commentSchema)
})
```

`'CommentController.index'` is resolved once at boot: the container builds the
controller, the method is bound, and the server stores a plain function. See
[controllers-and-di.md](controllers-and-di.md).

## Next

- [Project structure](project-structure.md): what each folder does and the boot order
- [Routing](routing.md): groups, schemas, per-route middleware
- [Database](database.md): migrations, seeders, relations
