import { str, num, bool } from 'envalid'

export default {
  NODE_ENV: str({ default: 'development', choices: ['development', 'test', 'production'] }),
  HOST: str({ default: '127.0.0.1' }),
  PORT: num({ default: 3000 }),
  LOGGER: bool({ default: true }),
  DB_FILE: str({ default: './database/app.sqlite' }),

  // No default on purpose: a missing JWT_SECRET must stop the boot rather than
  // silently fall back to a literal that would end up signing production tokens.
  JWT_SECRET: str(),
  JWT_EXPIRES_IN: str({ default: '1h' }),

  RATE_LIMIT_MAX: num({ default: 100 }),
  CORS_ORIGIN: str({ default: 'http://localhost:3000' }),
}
