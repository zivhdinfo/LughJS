# Benchmarks

Generated 2026-08-20T00:39:18.883Z by `npm run bench`.

## Machine

| | |
|---|---|
| platform | win32 10.0.26100 (x64) |
| cpu | Intel(R) Core(TM) i5-10400F CPU @ 2.90GHz x12 |
| memory | 31.9 GB |
| node | v24.18.0 |

> Taken on a desktop that was also running other software. Treat these as a
> baseline for **this machine** — useful for spotting a regression between two
> runs, not for quoting as the throughput of a tuned deployment.

## Method

- The server runs in its own process; the load generator never shares an event
  loop with it.
- Every boot is followed by a discarded 8s warmup.
- 5 samples per cell. The **median** is reported and every
  sample is listed, so the spread stays visible.
- Each endpoint is verified for status, content type and body before it is
  timed. The render suite specifically asserts that a hostile row comes back
  escaped and that the request-time row is present.
- **A single non-2xx during a measured run fails the benchmark.** An error
  response is cheaper to produce than real work, so without this rule a broken
  server reports better numbers than a working one.
- Resident memory is read from the server's own process id.

Every suite returned the expected status, content type and body on every measured run.

## Throughput

Median of 5 rounds, 64 concurrent connections.

| suite | what it exercises | req/s | p50 | p99 | MB/s | spread |
|---|---|---|---|---|---|---|
| `json` | route match + JSON serialization, no I/O | **29,602** | 2.00ms | 3.00ms | 5.6 | ±3.8% |
| `query` | controller → service → one indexed row out of 10,000 | **10,242** | 6.00ms | 8.00ms | 2.0 | ±2.2% |
| `render` | a full table read, HTML escaping, an added row and a sort | **9,179** | 6.00ms | 9.00ms | 11.9 | ±2.8% |
| `write` | schema validation, an insert and a serialized 201 | **6,700** | 8.00ms | 18.00ms | 1.6 | ±0.9% |

Every individual sample, so the spread is not hidden behind a median:

- `json` — 29602, 30329, 29412, 29195, 30194 req/s
- `query` — 10149, 10247, 10242, 10175, 10373 req/s
- `render` — 9243, 9189, 8984, 9179, 9163 req/s
- `write` — 6655, 6700, 6713, 6665, 6714 req/s

## Startup and memory

| | |
|---|---|
| cold start (median of 5) | 953 ms |
| resident memory, idle | 105 MB |
| resident memory, under load | 302 MB |

Cold start includes reading the config, opening the pool, constructing every
service and controller, compiling the schemas and installing the routes — the
whole of the boot sequence, once.

## What the hardened profile costs

The same application, measured again with security headers, CORS, rate limiting
and token verification switched on. This is the price of the middleware, not of
the framework.

| suite | plain | hardened | cost |
|---|---|---|---|
| `json` | 29,602 | 16,439 | -44.5% |
| `query` | 10,242 | 7,960 | -22.3% |
| `render` | 9,179 | 6,878 | -25.1% |
| `write` | 6,700 | 5,205 | -22.3% |
