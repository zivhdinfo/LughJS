import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { FORTUNES, EXTRA_FORTUNE } from '../fixtures/fortunes.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const canonicalSqlPath = path.join(here, '..', 'fixtures', 'canonical-fortunes.sql')

/**
 * Pinned checksums of the VERBATIM download from the official TechEmpower
 * FrameworkBenchmarks repository (toolset/databases/postgres/create-postgres.sql,
 * branch master). If the upstream file ever changes legitimately, regenerate
 * the fixture AND update these hashes together, with a recorded reason.
 */
const CANONICAL_FILE_SHA256 = 'cd7be3babcc9dbaef47afaea828a23cb0aee459fb27a73b63eee5d8e36acd0ab'
const CANONICAL_INSERTS_SHA256 = 'df03e59248a69e15192c16c74c8520e612b2eec147aa38f275f2124b2a641b44'

/** Parses `INSERT INTO Fortune (id, message) VALUES (N, '...');` lines. */
function parseCanonicalRows(sql: string): Array<[number, string]> {
  return sql
    .split(/\r?\n/)
    .filter((l) => /^INSERT INTO Fortune/.test(l))
    .map((line) => {
      const m = line.match(/VALUES \((\d+), '(.*)'\);/)
      assert.ok(m, `cannot parse canonical line: ${line}`)
      return [Number(m[1]), m[2].replace(/''/g, "'")] as [number, string]
    })
}

test('the pinned source file is the verbatim upstream download', () => {
  const sql = fs.readFileSync(canonicalSqlPath, 'utf8')
  const fileHash = crypto.createHash('sha256').update(sql, 'utf8').digest('hex')
  assert.equal(fileHash, CANONICAL_FILE_SHA256, 'canonical-fortunes.sql drifted from the pinned TFB download')

  const insertLines = sql.split(/\r?\n/).filter((l) => /^INSERT INTO Fortune/.test(l))
  const insertsHash = crypto.createHash('sha256').update(insertLines.join('\n'), 'utf8').digest('hex')
  assert.equal(insertsHash, CANONICAL_INSERTS_SHA256, 'fortune INSERT lines drifted from the pinned TFB download')
})

test('the fixture matches the pinned dataset exactly', () => {
  const sql = fs.readFileSync(canonicalSqlPath, 'utf8')
  const canonical = parseCanonicalRows(sql)

  // Row count
  assert.equal(FORTUNES.length, canonical.length, 'row count must match canonical (12)')
  assert.equal(FORTUNES.length, 12)

  // Per-row exact match (id + message), which also pins per-row lengths
  for (let i = 0; i < canonical.length; i++) {
    const [cid, cmsg] = canonical[i]
    const [fid, fmsg] = FORTUNES[i]
    assert.equal(fid, cid, `row ${i + 1} id mismatch`)
    assert.equal(fmsg, cmsg, `row ${i + 1} message mismatch`)
  }

  // Schema constraint: message column is varchar(2048)
  for (const [, msg] of FORTUNES) {
    assert.ok(msg.length <= 2048, `message exceeds varchar(2048): ${msg.slice(0, 60)}...`)
  }
})

test('the row with awkward punctuation survived generation intact', () => {
  const row4 = FORTUNES[3]
  assert.equal(row4[0], 4)
  assert.equal(row4[1], 'A bad random number generator: 1, 1, 1, 1, 1, 4.33e+67, 1, 1, 1')
  assert.ok(row4[1].endsWith('4.33e+67, 1, 1, 1'), 'row 4 must end at "4.33e+67, 1, 1, 1"')
})

test('the hostile row and the request-time row are both present', () => {
  const messages = FORTUNES.map(([, m]) => m)
  assert.ok(
    messages.includes('<script>alert("This should not be displayed in a browser alert box.");</script>'),
    'canonical XSS row missing',
  )
  assert.equal(EXTRA_FORTUNE, 'Additional fortune added at request time.')
})

test('the fixture is stable against accidental regeneration', () => {
  // Regenerate in-memory from the canonical SQL and compare: catches
  // hand-edits that drifted from the generator output.
  const sql = fs.readFileSync(canonicalSqlPath, 'utf8')
  const rows = parseCanonicalRows(sql)
  const expectedLines = rows.map((r) => `  [${r[0]}, ${JSON.stringify(r[1])}],`).join('\n')
  const fixture = fs.readFileSync(path.join(here, '..', 'fixtures', 'fortunes.ts'), 'utf8')
  assert.ok(fixture.includes(expectedLines), 'fortunes.ts does not match generator output for the canonical SQL')
})
