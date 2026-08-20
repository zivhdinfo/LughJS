import { str, num } from 'envalid'

export default {
  NODE_ENV: str({ default: 'bench', choices: ['bench', 'test', 'development', 'production'] }),
  PORT: num({ default: 0 }),
}
