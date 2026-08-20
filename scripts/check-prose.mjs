#!/usr/bin/env node
// Fails if an em dash appears anywhere in the repository's own prose.
//
// The character is banned in descriptions, comments, documentation and CLI
// output. The one exception is bench/fixtures/, which holds a verbatim upstream
// dataset that two rows of the TechEmpower corpus happen to contain, and which
// bench/test/fortunes.test.ts pins by SHA-256.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
// Built from its code point so this file does not trip its own check.
const EM_DASH = String.fromCharCode(0x2014)

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.mcp-view'])
const SKIP_PATHS = ['bench/fixtures/']
const EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.cjs', '.md', '.json', '.yml', '.yaml'])

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield* walk(path.join(dir, entry.name))
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      yield path.join(dir, entry.name)
    }
  }
}

const offenders = []
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/')
  if (SKIP_PATHS.some((p) => rel.startsWith(p))) continue
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (line.includes(EM_DASH)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
  })
}

if (offenders.length > 0) {
  console.error(`Found ${offenders.length} em dash(es). Use a comma, a colon, parentheses or a full stop.\n`)
  for (const o of offenders) console.error(`  ${o}`)
  process.exit(1)
}

console.log('prose: no em dashes outside bench/fixtures')
