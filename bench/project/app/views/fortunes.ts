import type { FortuneRow } from '../../../fixtures/fortunes.js'

/**
 * Server-side template for the TFB "Fortunes" test. Shared by the
 * framework app and the bare baseline so both render byte-identical HTML.
 * TFB rules: escape HTML, include the extra fortune row, sort by message.
 */

export const EXTRA_FORTUNE = 'Additional fortune added at request time.'

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface FortuneViewRow {
  id: number
  message: string
}

function toViewRows(rows: readonly FortuneRow[] | readonly FortuneViewRow[]): FortuneViewRow[] {
  if (rows.length === 0) return []
  if (Array.isArray(rows[0])) {
    return (rows as readonly FortuneRow[]).map(([id, message]) => ({ id, message }))
  }
  return rows as FortuneViewRow[]
}

/** Adds the extra fortune, sorts by message, renders the TFB HTML table. */
export function renderFortunesHtml(rows: readonly FortuneRow[] | readonly FortuneViewRow[]): string {
  const all = [...toViewRows(rows), { id: 0, message: EXTRA_FORTUNE }].sort((a, b) =>
    a.message < b.message ? -1 : a.message > b.message ? 1 : 0,
  )

  const table = all.map((r) => `<tr><td>${r.id}</td><td>${escapeHtml(r.message)}</td></tr>`).join('')
  return `<!DOCTYPE html><html><head><title>Fortunes</title></head><body><table>${table}</table></body></html>`
}
