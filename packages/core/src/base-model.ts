import { Model } from 'objection'

/**
 * Base class for all app models. Subclasses declare `static tableName`
 * and optional `static relationMappings` (Objection/Knex conventions).
 */
export class BaseModel extends Model {}
