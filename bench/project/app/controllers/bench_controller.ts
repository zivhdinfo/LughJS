/**
 * The `json` suite routes through a controller like every other suite.
 *
 * It used to be an inline function in `start/routes.ts`, which meant it
 * measured the bare HTTP layer and never touched the container or a controller
 * at all, so the one suite people quote was the one measuring the least.
 */
export default class BenchController {
  json() {
    return { message: 'Hello, World!' }
  }
}
