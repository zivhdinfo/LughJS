import { BaseModel } from '@lughjs/core'
import type { RelationMappings } from 'objection'
import User from './user.js'

export default class Post extends BaseModel {
  static tableName = 'posts'

  id!: number
  user_id!: number
  title!: string
  body!: string
  created_at!: string
  updated_at!: string

  static get relationMappings(): RelationMappings {
    return {
      author: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: () => User,
        join: { from: 'posts.user_id', to: 'users.id' },
      },
    }
  }
}
