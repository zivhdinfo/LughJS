import bcrypt from 'bcryptjs'
import type { Knex } from 'knex'

interface UserRow {
  id: number
  name: string
  email: string
  password_hash: string | null
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode = 401,
  ) {
    super(message)
  }
}

/** The only columns that may ever be returned to a client. */
const PUBLIC_COLUMNS = ['id', 'name', 'email', 'created_at', 'updated_at'] as const

/**
 * A valid bcrypt hash of a value no submitted password will match. Comparing
 * against it when the email is unknown keeps the response time of "no such
 * user" and "wrong password" the same, so login cannot be used to enumerate
 * which addresses are registered.
 */
const DUMMY_HASH = '$2b$12$Ku0Zt1oQ8bV3rG5nJ7pW.uH4xY6zA8cE0dF2gI4kM6oQ8sU0wY2aC'

const BCRYPT_COST = 12

export default class AuthService {
  constructor(private readonly db: Knex) {}

  async register(input: { name: string; email: string; password: string }) {
    const existing = await this.db<UserRow>('users').where({ email: input.email }).first()
    if (existing) throw new AuthError('Email already registered', 409)

    const password_hash = await bcrypt.hash(input.password, BCRYPT_COST)
    const [user] = await this.db('users')
      .insert({ name: input.name, email: input.email, password_hash })
      .returning([...PUBLIC_COLUMNS])
    return user as { id: number; name: string; email: string }
  }

  async verify(email: string, password: string) {
    const user = await this.db<UserRow>('users').where({ email }).first()

    // Always run one bcrypt comparison, whether or not the account exists.
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)
    if (!user || !user.password_hash || !ok) throw new AuthError('Invalid credentials')

    return { id: user.id, name: user.name, email: user.email }
  }

  findById(id: number) {
    return this.db('users').where({ id }).first([...PUBLIC_COLUMNS])
  }
}
