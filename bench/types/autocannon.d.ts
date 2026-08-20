declare module 'autocannon' {
  export interface LatencyStats {
    average: number
    mean: number
    stddev: number
    min: number
    max: number
    p0_001: number
    p0_01: number
    p0_1: number
    p1: number
    p2_5: number
    p10: number
    p25: number
    p50: number
    p75: number
    p90: number
    p97_5: number
    p99: number
    p99_9: number
    p99_99: number
    p99_999: number
    total: number
  }

  export interface CountStats {
    average: number
    mean: number
    stddev: number
    min: number
    max: number
    total: number
  }

  export interface Result {
    title: string
    url: string
    socketPath: string
    requests: CountStats
    latency: LatencyStats
    throughput: CountStats
    errors: number
    timeouts: number
    mismatches: number
    non2xx: number
    resets: number
    '1xx': number
    '2xx': number
    '3xx': number
    '4xx': number
    '5xx': number
    start: number
    finish: number
    connections: number
    pipelining: number
    duration: number
    samples: number[]
  }

  export interface Options {
    url: string
    socketPath?: string
    connections?: number
    duration?: number
    amount?: number
    timeout?: number
    pipelining?: number
    bailout?: number
    method?: string
    title?: string
    body?: string | Buffer
    headers?: Record<string, string>
    setupClient?: (client: unknown) => void
    maxConnectionRequests?: number
    maxOverallRequests?: number
    connectionRate?: number
    overallRate?: number
    reconnectRate?: number
    excludeErrorStats?: boolean
    servername?: string
    tlsOptions?: Record<string, unknown>
    requests?: unknown[]
    idReplacement?: boolean
    forever?: boolean
    servername?: string
  }

  export interface Instance {
    on(event: string, listener: (...args: unknown[]) => void): Instance
    stop(): void
    destroyed: boolean
  }

  function autocannon(opts: Options): Promise<Result>
  function autocannon(opts: Options, cb: (err: Error | null, result: Result) => void): Instance

  export default autocannon
}
