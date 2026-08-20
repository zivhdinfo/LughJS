import User from '../models/user.js'
import Post from '../models/post.js'

/**
 * Explicitly projected columns. The route's response schema already strips
 * `password_hash`, but selecting it in the first place means it lives in
 * process memory and in any log of the query result — so it is never fetched.
 */
const PUBLIC_COLUMNS = ['users.id', 'users.name', 'users.email', 'users.created_at', 'users.updated_at']

export default class UserService {
  all() {
    return User.query().select(PUBLIC_COLUMNS).withGraphFetched('posts').orderBy('users.id', 'asc')
  }

  find(id: number) {
    return User.query().select(PUBLIC_COLUMNS).withGraphFetched('posts').findById(id)
  }

  postsOf(userId: number) {
    return Post.query().where('user_id', userId).orderBy('id', 'desc')
  }
}
