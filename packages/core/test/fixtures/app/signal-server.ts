import { createApp, installShutdownHandlers, gracefulShutdown } from '@lughjs/core'

// Signal-test fixture: boots, announces READY, runs until signaled.
const root = process.cwd()
const { server, db, env } = await createApp(root)
const log = (msg: string) => console.log(msg)
installShutdownHandlers(server, db, { logger: log })

const port = Number(env.PORT ?? 0)
await server.listen({ port, host: '127.0.0.1' })
console.log('READY')

// Windows has no real SIGTERM for child processes; also accept a stdin
// "shutdown" line so the graceful path can be exercised everywhere.
process.stdin?.on('data', (d) => {
  if (String(d).trim() === 'shutdown') {
    void gracefulShutdown(server, db, { logger: log }).then(() => process.exit(0))
  }
})
