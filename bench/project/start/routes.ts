import { Route } from '@lughjs/core'
import { postSchema } from '../app/validation/post_schema.js'

export default function routes(): void {
  // Every suite goes through a controller, so none of them accidentally
  // measures the bare HTTP layer with the framework switched off.
  Route.get('/json', 'BenchController.json')
  Route.get('/db', 'WorldController.random')
  Route.get('/fortunes', 'FortuneController.index')
  Route.post('/api/posts', 'PostsController.store').schema(postSchema)
}
