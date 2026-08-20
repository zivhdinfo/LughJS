import { BaseModel } from '@lughjs/core'
import type { RelationMappings } from 'objection'
import Post from './post.js'

export default class User extends BaseModel {
  static tableName = 'users'

  id!: number
  name!: string
  email!: string
  created_at!: string
  updated_at!: string

  static get relationMappings(): RelationMappings {
    return {
      posts: {
        relation: BaseModel.HasManyRelation,
        modelClass: () => Post,
        join: { from: 'users.id', to: 'posts.user_id' },
      },
    }
  }
}
