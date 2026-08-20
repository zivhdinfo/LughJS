import type { Knex } from 'knex'

/**
 * The measurement profile.
 *
 * One place for the database, the load shape and the payloads, so a change to
 * how the benchmark runs is a change to one file and every number in the report
 * stays comparable to the last run.
 */
export const PROFILE = {
  db: {
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
  } as Knex.Config,

  // Each knob can be lowered from the command line for a quick smoke run
  // (`BENCH_ROUNDS=1 BENCH_DURATION=2 npm run bench`) without editing the file
  // and risking a committed profile that no longer matches the report.
  load: {
    connections: Number(process.env.BENCH_CONNECTIONS ?? 64),
    /** Seconds of load per measured sample. */
    duration: Number(process.env.BENCH_DURATION ?? 10),
    /** Seconds of load thrown away after each boot, so the JIT has settled. */
    warmup: Number(process.env.BENCH_WARMUP ?? 8),
    /** Samples per cell; the reported figure is the median of these. */
    rounds: Number(process.env.BENCH_ROUNDS ?? 5),
    pipelining: Number(process.env.BENCH_PIPELINING ?? 1),
  },

  /**
   * Rate limiting is part of the hardened profile, but a limit the load can
   * actually reach turns the whole exercise into a measurement of how fast
   * rejections are produced — and a rejection is cheaper than real work, so
   * throughput would go UP while the server stopped doing anything useful.
   * The ceiling is set out of reach, and the runner additionally fails the run
   * if a single non-2xx appears.
   */
  rateLimitMax: 50_000_000,

  postBody: JSON.stringify({ title: 'Benchmark Post', body: 'A realistic validated JSON payload.' }),
  postHeaders: { 'content-type': 'application/json' },
} as const
