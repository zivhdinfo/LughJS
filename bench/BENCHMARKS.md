# Benchmarks

Generated 2026-08-20T02:17:11.744Z by `npm run bench`.

## Machine

| | |
|---|---|
| platform | win32 10.0.26100 (x64) |
| cpu | Intel(R) Core(TM) i5-10400F CPU @ 2.90GHz x12 |
| memory | 31.9 GB |
| node | v24.18.0 |

> Taken on a desktop that was also running other software. Treat these as a
> baseline for **this machine**: useful for spotting a regression between two
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
| `json` | route match + JSON serialization, no I/O | **28,553** | 2.00ms | 3.00ms | 5.4 | ±7.4% |
| `query` | controller → service → one indexed row out of 10,000 | **10,030** | 6.00ms | 9.00ms | 1.9 | ±4.4% |
| `render` | a full table read, HTML escaping, an added row and a sort | **8,893** | 6.00ms | 10.00ms | 11.5 | ±5.5% |
| `write` | schema validation, an insert and a serialized 201 | **6,400** | 9.00ms | 19.00ms | 1.6 | ±6.5% |

Every individual sample, so the spread is not hidden behind a median:

- `json` : 28348, 29147, 29029, 27036, 28553 req/s
- `query` : 9672, 10030, 10047, 9659, 10104 req/s
- `render` : 8757, 9043, 8580, 9073, 8893 req/s
- `write` : 6523, 6400, 6153, 6382, 6570 req/s

## Startup and memory

| | |
|---|---|
| cold start (median of 5) | 953 ms |
| resident memory, idle | 110 MB |
| resident memory, under load | 305 MB |

Cold start includes reading the config, opening the pool, constructing every
service and controller, compiling the schemas and installing the routes. That is the
whole of the boot sequence, once.

## What the hardened profile costs

The same application, measured again with security headers, CORS, rate limiting
and token verification switched on. This is the price of the middleware, not of
the framework.

| suite | plain | hardened | cost |
|---|---|---|---|
| `json` | 28,553 | 15,632 | -45.3% |
| `query` | 10,030 | 7,345 | -26.8% |
| `render` | 8,893 | 6,494 | -27.0% |
| `write` | 6,400 | 4,917 | -23.2% |
