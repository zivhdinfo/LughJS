import { createApp, installShutdownHandlers } from '@lughjs/core'

const { server, db, env } = await createApp(process.cwd())

// Stop accepting connections, drain what is in flight, then close the pool.
installShutdownHandlers(server, db, { logger: (msg) => server.log.info(msg) })

await server.listen({ host: String(env.HOST), port: Number(env.PORT) })
