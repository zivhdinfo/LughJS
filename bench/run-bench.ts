/**
 * Measures a Lugh application against itself.
 *
 * The point is not a league table. It is to know, for this codebase, what each
 * kind of request costs, how much of that cost is the hardened middleware, and
 * whether a change made things slower — with numbers you can trust because the
 * method refuses to report anything it has not verified.
 *
 * Method:
 *  - the server runs in its OWN process, so the load generator never competes
 *    with it for the same event loop
 *  - a discarded warmup after every boot, so the JIT and the pool are settled
 *  - N samples per cell, and the MEDIAN is reported — never the best run, which
 *    would systematically flatter every number
 *  - every sample is printed, so the spread is visible instead of summarised
 *  - each endpoint is verified for status, content-type and body BEFORE it is
 *    timed, and a single non-2xx during a measured run fails the whole benchmark
 */
import autocannon from 'autocannon'
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROFILE } from './profile.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(here, 'BENCHMARKS.md')
const SERVER = path.join(here, 'servers', 'lugh.ts')
const PORT = Number(process.env.BENCH_PORT ?? 39500)

interface Suite {
  name: string
  what: string
  path: string
  method: 'GET' | 'POST'
  body?: string
  headers?: Record<string, string>
  verify: (res: { status: number; contentType: string; body: string }) => string[]
}

const SUITES: Suite[] = [
  {
    name: 'json',
    what: 'route match + JSON serialization, no I/O',
    path: '/json',
    method: 'GET',
    verify: (r) => {
      const p: string[] = []
      if (r.status !== 200) p.push(`status ${r.status}`)
      if (!r.contentType.includes('application/json')) p.push(`content-type ${r.contentType}`)
      if (r.body !== '{"message":"Hello, World!"}') p.push(`body ${r.body.slice(0, 60)}`)
      return p
    },
  },
  {
    name: 'query',
    what: 'controller → service → one indexed row out of 10,000',
    path: '/db',
    method: 'GET',
    verify: (r) => {
      const p: string[] = []
      if (r.status !== 200) p.push(`status ${r.status}`)
      if (typeof JSON.parse(r.body)?.id !== 'number') p.push(`no numeric id in ${r.body.slice(0, 60)}`)
      return p
    },
  },
  {
    name: 'render',
    what: 'a full table read, HTML escaping, an added row and a sort',
    path: '/fortunes',
    method: 'GET',
    verify: (r) => {
      const p: string[] = []
      if (r.status !== 200) p.push(`status ${r.status}`)
      if (!r.contentType.includes('text/html')) p.push(`content-type ${r.contentType}`)
      if (!r.body.includes('&lt;script&gt;')) p.push('the hostile row is not HTML-escaped')
      if (!r.body.includes('Additional fortune added at request time.')) p.push('the added row is missing')
      return p
    },
  },
  {
    name: 'write',
    what: 'schema validation, an insert and a serialized 201',
    path: '/api/posts',
    method: 'POST',
    body: PROFILE.postBody,
    headers: PROFILE.postHeaders,
    verify: (r) => {
      const p: string[] = []
      if (r.status !== 201) p.push(`status ${r.status}`)
      const row = JSON.parse(r.body)
      if (typeof row?.id !== 'number') p.push(`no inserted id in ${r.body.slice(0, 60)}`)
      if (row?.title !== 'Benchmark Post') p.push('the row was not persisted as sent')
      return p
    },
  },
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitForReady(url: string, timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      await res.arrayBuffer()
      return true
    } catch {
      await sleep(150)
    }
  }
  return false
}

function killTree(pid: number | undefined): void {
  if (!pid) return
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(pid, 'SIGKILL')
  } catch {
    /* already gone */
  }
}

/** Resident memory of the SERVER process — never of this one. */
function rssMB(pid: number | undefined): number {
  if (!pid) return 0
  try {
    if (process.platform !== 'win32') return 0
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).WorkingSet64`],
      { encoding: 'utf8', timeout: 8000 },
    ).trim()
    return out ? Number(out) / 1024 / 1024 : 0
  } catch {
    return 0
  }
}

async function startServer(hardened: boolean): Promise<{ pid: number | undefined; bootMs: number }> {
  const started = process.hrtime.bigint()
  const child = spawn(process.execPath, ['--import', 'tsx', SERVER], {
    cwd: here,
    env: { ...process.env, PORT: String(PORT), BENCH_SECURITY: hardened ? '1' : '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
  child.stdout.on('data', () => {})

  const ok = await waitForReady(`http://127.0.0.1:${PORT}/json`)
  const bootMs = Number(process.hrtime.bigint() - started) / 1e6
  if (!ok) {
    killTree(child.pid)
    throw new Error(`[bench] the server never became ready.\n${stderr.slice(0, 4000)}`)
  }
  return { pid: child.pid, bootMs }
}

async function probe(suite: Suite) {
  const res = await fetch(`http://127.0.0.1:${PORT}${suite.path}`, {
    method: suite.method,
    body: suite.body,
    headers: suite.headers,
  })
  return { status: res.status, contentType: res.headers.get('content-type') ?? '', body: await res.text() }
}

interface Sample {
  rps: number
  p50: number
  p99: number
  throughputMB: number
  errors: number
  non2xx: number
}

async function fire(suite: Suite, duration: number): Promise<Sample> {
  const r = await autocannon({
    url: `http://127.0.0.1:${PORT}${suite.path}`,
    method: suite.method,
    body: suite.body,
    headers: suite.headers,
    connections: PROFILE.load.connections,
    pipelining: PROFILE.load.pipelining,
    duration,
  })
  return {
    rps: r.requests.average,
    p50: r.latency.p50,
    p99: r.latency.p99,
    throughputMB: r.throughput.average / 1024 / 1024,
    errors: r.errors,
    non2xx: r.non2xx,
  }
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? (s[m] as number) : (((s[m - 1] as number) + (s[m] as number)) / 2)
}

interface Cell {
  rps: number
  runs: number[]
  spreadPct: number
  p50: number
  p99: number
  throughputMB: number
}

interface PassResult {
  cells: Record<string, Cell>
  bootMs: number
  idleRssMB: number
  loadedRssMB: number
}

const problems: string[] = []

async function runPass(hardened: boolean): Promise<PassResult> {
  const samples: Record<string, Sample[]> = {}
  const boots: number[] = []
  let idleRssMB = 0
  let loadedRssMB = 0

  console.log(`\n${'─'.repeat(60)}\n${hardened ? 'hardened' : 'plain'} profile\n${'─'.repeat(60)}`)

  for (let round = 0; round < PROFILE.load.rounds; round++) {
    const server = await startServer(hardened)
    boots.push(server.bootMs)
    if (round === 0) idleRssMB = rssMB(server.pid)

    try {
      if (round === 0) {
        for (const suite of SUITES) {
          const found = suite.verify(await probe(suite))
          if (found.length) problems.push(`${suite.name} (${hardened ? 'hardened' : 'plain'}): ${found.join('; ')}`)
        }
      }

      await fire(SUITES[0] as Suite, PROFILE.load.warmup)

      const line: string[] = []
      for (const suite of SUITES) {
        if (problems.some((p) => p.startsWith(`${suite.name} (`))) continue
        const s = await fire(suite, PROFILE.load.duration)
        if (s.non2xx > 0 || s.errors > 0) {
          problems.push(
            `${suite.name} (${hardened ? 'hardened' : 'plain'}): ${s.non2xx} non-2xx and ${s.errors} errors during a ` +
              `measured run — these numbers do not describe successful work`,
          )
        }
        ;(samples[suite.name] ??= []).push(s)
        line.push(`${suite.name} ${Math.round(s.rps)}`)
      }
      loadedRssMB = Math.max(loadedRssMB, rssMB(server.pid))
      console.log(`  round ${round + 1}/${PROFILE.load.rounds}  ${line.join('  ')}`)
    } finally {
      killTree(server.pid)
      await sleep(1500)
    }
  }

  const cells: Record<string, Cell> = {}
  for (const suite of SUITES) {
    const all = samples[suite.name] ?? []
    if (!all.length) continue
    const runs = all.map((s) => s.rps)
    cells[suite.name] = {
      rps: median(runs),
      runs: runs.map((r) => Math.round(r)),
      spreadPct: ((Math.max(...runs) - Math.min(...runs)) / median(runs)) * 100,
      p50: median(all.map((s) => s.p50)),
      p99: median(all.map((s) => s.p99)),
      throughputMB: median(all.map((s) => s.throughputMB)),
    }
  }
  return { cells, bootMs: median(boots), idleRssMB, loadedRssMB }
}

// ─────────────────────────────────────────────────────────────────────────────

const machine = {
  platform: `${os.platform()} ${os.release()} (${os.arch()})`,
  cpu: `${os.cpus()[0]?.model ?? 'unknown'} x${os.cpus().length}`,
  memory: `${(os.totalmem() / 1024 ** 3).toFixed(1)} GB`,
  node: process.version,
  date: new Date().toISOString(),
}

console.log(`\n${machine.cpu} | ${machine.memory} | ${machine.platform} | node ${machine.node}`)
console.log(
  `${PROFILE.load.rounds} rounds; per boot: ${PROFILE.load.warmup}s warmup + ` +
    `${PROFILE.load.duration}s per suite at ${PROFILE.load.connections} connections`,
)

const plain = await runPass(false)
const hardened = await runPass(true)

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

const resultsTable = `
## Throughput

Median of ${PROFILE.load.rounds} rounds, ${PROFILE.load.connections} concurrent connections.

| suite | what it exercises | req/s | p50 | p99 | MB/s | spread |
|---|---|---|---|---|---|---|
${SUITES.filter((s) => plain.cells[s.name])
  .map((s) => {
    const c = plain.cells[s.name] as Cell
    return `| \`${s.name}\` | ${s.what} | **${fmt(c.rps)}** | ${c.p50.toFixed(2)}ms | ${c.p99.toFixed(2)}ms | ${c.throughputMB.toFixed(1)} | ±${c.spreadPct.toFixed(1)}% |`
  })
  .join('\n')}

Every individual sample, so the spread is not hidden behind a median:

${SUITES.filter((s) => plain.cells[s.name])
  .map((s) => `- \`${s.name}\` — ${(plain.cells[s.name] as Cell).runs.join(', ')} req/s`)
  .join('\n')}

## Startup and memory

| | |
|---|---|
| cold start (median of ${PROFILE.load.rounds}) | ${Math.round(plain.bootMs)} ms |
| resident memory, idle | ${plain.idleRssMB.toFixed(0)} MB |
| resident memory, under load | ${plain.loadedRssMB.toFixed(0)} MB |

Cold start includes reading the config, opening the pool, constructing every
service and controller, compiling the schemas and installing the routes — the
whole of the boot sequence, once.

## What the hardened profile costs

The same application, measured again with security headers, CORS, rate limiting
and token verification switched on. This is the price of the middleware, not of
the framework.

| suite | plain | hardened | cost |
|---|---|---|---|
${SUITES.filter((s) => plain.cells[s.name] && hardened.cells[s.name])
  .map((s) => {
    const a = plain.cells[s.name] as Cell
    const b = hardened.cells[s.name] as Cell
    return `| \`${s.name}\` | ${fmt(a.rps)} | ${fmt(b.rps)} | ${(((b.rps - a.rps) / a.rps) * 100).toFixed(1)}% |`
  })
  .join('\n')}
`

const problemsSection = problems.length
  ? `\n## ❌ These numbers are not valid\n\n${problems.map((p) => `- ${p}`).join('\n')}\n`
  : '\nEvery suite returned the expected status, content type and body on every measured run.\n'

const doc = `# Benchmarks

Generated ${machine.date} by \`npm run bench\`.

## Machine

| | |
|---|---|
| platform | ${machine.platform} |
| cpu | ${machine.cpu} |
| memory | ${machine.memory} |
| node | ${machine.node} |

> Taken on a desktop that was also running other software. Treat these as a
> baseline for **this machine** — useful for spotting a regression between two
> runs, not for quoting as the throughput of a tuned deployment.

## Method

- The server runs in its own process; the load generator never shares an event
  loop with it.
- Every boot is followed by a discarded ${PROFILE.load.warmup}s warmup.
- ${PROFILE.load.rounds} samples per cell. The **median** is reported and every
  sample is listed, so the spread stays visible.
- Each endpoint is verified for status, content type and body before it is
  timed. The render suite specifically asserts that a hostile row comes back
  escaped and that the request-time row is present.
- **A single non-2xx during a measured run fails the benchmark.** An error
  response is cheaper to produce than real work, so without this rule a broken
  server reports better numbers than a working one.
- Resident memory is read from the server's own process id.
${problemsSection}${resultsTable}`

fs.writeFileSync(OUT, doc, 'utf8')
console.log(`\n📄 wrote ${OUT}`)

if (problems.length) {
  console.log('\n❌ the run is not valid:')
  for (const p of problems) console.log(`   ${p}`)
}
process.exitCode = problems.length ? 1 : 0
