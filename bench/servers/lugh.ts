/**
 * The application under measurement, started as its own process.
 *
 * It is booted exactly the way a real project is — `createApp` reads the
 * config, opens the pool, builds the container, wires the controllers and
 * installs the routes. Nothing is stubbed and no shortcut path exists, so what
 * the runner measures is the framework as shipped.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, runMigrations } from '@lughjs/core'
import { seedBenchData } from '../seed.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'project')

const { server, db } = await createApp(root)
await runMigrations(db, path.join(root, 'database', 'migrations'))
await seedBenchData(db)

await server.listen({ port: Number(process.env.PORT ?? 0), host: '127.0.0.1' })
process.stdout.write(`READY ${(server.server.address() as { port: number }).port}\n`)
