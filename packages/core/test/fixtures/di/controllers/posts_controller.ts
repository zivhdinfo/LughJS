import PostsService from '../services/posts_service'

export default class PostsController {
  constructor(private readonly postsService: PostsService) {}

  index() {
    return this.postsService.all()
  }
}
