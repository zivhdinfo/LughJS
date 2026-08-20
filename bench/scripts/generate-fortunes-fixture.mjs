// One-off generator: parses the canonical TFB fortunes SQL (verbatim download)
// and emits the TS fixture. Never hand-type the fixture from memory.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sqlPath = path.join(here, '..', 'fixtures', 'canonical-fortunes.sql')
const outPath = path.join(here, '..', 'fixtures', 'fortunes.ts')

const sql = fs.readFileSync(sqlPath, 'utf8')
const lines = sql.split(/\r?\n/).filter((l) => /^INSERT INTO Fortune/.test(l))
if (lines.length !== 12) throw new Error(`expected 12 fortune INSERTs, got ${lines.length}`)

const rows = lines.map((line) => {
  const m = line.match(/VALUES \((\d+), '(.*)'\);/)
  if (!m) throw new Error(`cannot parse line: ${line}`)
  return { id: Number(m[1]), message: m[2].replace(/''/g, "'") }
})

const ids = rows.map((r) => r.id)
if (new Set(ids).size !== 12) throw new Error('duplicate ids in canonical data')

const body = rows.map((r) => `  [${r.id}, ${JSON.stringify(r.message)}],`).join('\n')
const out = `// GENERATED from the official TechEmpower FrameworkBenchmarks repository
// (toolset/databases/postgres/create-postgres.sql, verbatim download).
// Regenerate with: node scripts/generate-fortunes-fixture.mjs
// DO NOT EDIT BY HAND — a corrupted fixture is caught by test/fortunes.test.ts.

export type FortuneRow = readonly [id: number, message: string]

export const FORTUNES: readonly FortuneRow[] = [
${body}
]

export const EXTRA_FORTUNE = 'Additional fortune added at request time.'
`
fs.writeFileSync(outPath, out, 'utf8')
console.log(`wrote ${outPath} with ${rows.length} rows`)
