// GENERATED from the official TechEmpower FrameworkBenchmarks repository
// (toolset/databases/postgres/create-postgres.sql, verbatim download).
// Regenerate with: node scripts/generate-fortunes-fixture.mjs
// DO NOT EDIT BY HAND — a corrupted fixture is caught by test/fortunes.test.ts.

export type FortuneRow = readonly [id: number, message: string]

export const FORTUNES: readonly FortuneRow[] = [
  [1, "fortune: No such file or directory"],
  [2, "A computer scientist is someone who fixes things that aren't broken."],
  [3, "After enough decimal places, nobody gives a damn."],
  [4, "A bad random number generator: 1, 1, 1, 1, 1, 4.33e+67, 1, 1, 1"],
  [5, "A computer program does what you tell it to do, not what you want it to do."],
  [6, "Emacs is a nice operating system, but I prefer UNIX. — Tom Christaensen"],
  [7, "Any program that runs right is obsolete."],
  [8, "A list is only as strong as its weakest link. — Donald Knuth"],
  [9, "Feature: A bug with seniority."],
  [10, "Computers make very fast, very accurate mistakes."],
  [11, "<script>alert(\"This should not be displayed in a browser alert box.\");</script>"],
  [12, "フレームワークのベンチマーク"],
]

export const EXTRA_FORTUNE = 'Additional fortune added at request time.'
