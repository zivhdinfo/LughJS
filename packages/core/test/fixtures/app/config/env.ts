import { str, num } from 'envalid'

export default {
  NODE_ENV: str({ default: 'test', choices: ['test', 'development', 'production'] }),
  PORT: num({ default: 0 }),
  LOGGER: str({ default: 'false' }),
}
