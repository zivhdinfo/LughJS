## What this changes

<!-- One or two sentences. If it fixes a bug, say what the bug did. -->

## Why

<!-- Link the issue if there is one. If there is not, explain the situation that
     made this necessary. -->

## Checks

- [ ] `npm run build --workspace @lughjs/core`
- [ ] `npm run typecheck --workspace @lughjs/core`
- [ ] `npm run typecheck --workspace @lughjs/demo`
- [ ] `npx tsc -p bench/tsconfig.json`
- [ ] `npm test`
- [ ] `npm run lint:prose`
- [ ] `npm audit --omit=dev`

## Notes for the reviewer

- [ ] Behaviour changed, and there is a test that fails without this change
- [ ] Documentation in `docs/` updated, or no document contradicts this
- [ ] `CHANGELOG.md` updated
- [ ] A guarantee in `SECURITY.md` changed, and `test/hardening.test.ts` says so

<!-- The benchmark fixture in bench/fixtures is pinned by SHA-256. If you
     regenerated it, say why, and update the hashes in the same commit. -->
