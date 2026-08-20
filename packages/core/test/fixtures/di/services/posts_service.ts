export default class PostsService {
  constructor(private readonly db: { query: (s: string) => string }) {}

  all() {
    return this.db.query('SELECT * FROM posts')
  }
}
