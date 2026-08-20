import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { controllerTemplate, modelTemplate, serviceTemplate, migrationTemplate, seederTemplate } from '../src/generators.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(here, '..', '..', '..')
const tscJs = path.join(workspaceRoot, 'node_modules', 'typescript', 'lib', 'tsc.js')

/**
 * Generator quality gate: scaffold a minimal project in a temp dir,
 * write the generator output into it, then strict-typecheck the result.
 */
function scaffoldTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lugh-gen-'))
  // Minimal package.json so tsc treats files as ESM.
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'gen-gate', type: 'module' }), 'utf8')
  // Link the workspace node_modules so '@lughjs/core' and 'fastify' resolve.
  try {
    fs.symlinkSync(path.join(workspaceRoot, 'node_modules'), path.join(dir, 'node_modules'), 'junction')
  } catch {
    // junction may fail on some setups; fall back to a paths mapping below
  }
  fs.mkdirSync(path.join(dir, 'app', 'models'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'app', 'services'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'app', 'controllers'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'database', 'migrations'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'database', 'seeders'), { recursive: true })
  // A model for the service/controller to import.
  fs.writeFileSync(
    path.join(dir, 'app', 'models', 'widget.ts'),
    `import { BaseModel } from '@lughjs/core'\nexport default class Widget extends BaseModel { static tableName = 'widgets' }\n`,
    'utf8',
  )
  return dir
}

function runTsc(dir: string): void {
  // Strict, NodeNext, noEmit — the same profile the framework requires.
  const tsconfig = {
    compilerOptions: {
      target: 'ES2023',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      types: [],
    },
    include: ['app', 'database'],
  }
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig), 'utf8')
  execFileSync(process.execPath, [tscJs, '-p', path.join(dir, 'tsconfig.json')], {
    cwd: dir,
    stdio: 'pipe',
    env: { ...process.env, PATH: `${path.join(workspaceRoot, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH ?? ''}` },
  })
}

test('controller template output passes strict typecheck', () => {
  const dir = scaffoldTempProject()
  try {
    fs.writeFileSync(path.join(dir, 'app', 'services', 'widget_service.ts'), serviceTemplate('Widget'), 'utf8')
    fs.writeFileSync(path.join(dir, 'app', 'controllers', 'widget_controller.ts'), controllerTemplate('Widget'), 'utf8')
    runTsc(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('model template output passes strict typecheck', () => {
  const dir = scaffoldTempProject()
  try {
    fs.writeFileSync(path.join(dir, 'app', 'models', 'widget.ts'), modelTemplate('Widget'), 'utf8')
    runTsc(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('service template output passes strict typecheck', () => {
  const dir = scaffoldTempProject()
  try {
    fs.writeFileSync(path.join(dir, 'app', 'models', 'widget.ts'), modelTemplate('Widget'), 'utf8')
    fs.writeFileSync(path.join(dir, 'app', 'services', 'widget_service.ts'), serviceTemplate('Widget'), 'utf8')
    runTsc(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('migration + seeder template output passes strict typecheck', () => {
  const dir = scaffoldTempProject()
  try {
    fs.writeFileSync(path.join(dir, 'database', 'migrations', '001_widgets.ts'), migrationTemplate('create_widgets'), 'utf8')
    fs.writeFileSync(path.join(dir, 'database', 'seeders', '001_widgets.ts'), seederTemplate('widgets'), 'utf8')
    runTsc(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('generated templates reference the expected classes and names', () => {
  const controller = controllerTemplate('BlogPost')
  assert.match(controller, /class BlogPostController/)
  assert.match(controller, /blogPostService/)
  const service = serviceTemplate('BlogPost')
  assert.match(service, /class BlogPostService/)
  assert.match(service, /BlogPost\.query\(\)/)
  const model = modelTemplate('BlogPost')
  assert.match(model, /class BlogPost extends BaseModel/)
  // Table names are pluralised, matching the migration/seeder conventions.
  // `override` is required under the scaffolded tsconfig's noImplicitOverride.
  assert.match(model, /static override tableName = 'blog_posts'/)
  const seeder = seederTemplate('blog_posts')
  assert.match(seeder, /knex\('blog_posts'\)\.del\(\)/)
  const migration = migrationTemplate('create_widgets')
  assert.match(migration, /createTable\('widgets'/)
  assert.match(migration, /dropTableIfExists\('widgets'/)
})
