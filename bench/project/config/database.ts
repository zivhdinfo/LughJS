import type { Knex } from 'knex'
import { PROFILE } from '../../profile.js'

// The measurement profile owns the connection settings, so a change there
// applies to the run and the report at the same time.
export default { ...PROFILE.db } satisfies Knex.Config
