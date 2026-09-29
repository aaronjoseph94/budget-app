import { useState } from 'react'
import type { Row } from '@budget/report-export'
import { Button } from '../components/ui/button.js'
import { Section } from '../forecast/parts.js'
import type { Category, LedgerRow } from '../ledger.js'
import { chargesCsvRows, summaryCsvRows } from './download.js'
import type { Reviewed } from './Overview.js'

/** How long a download's link lives: Safari reads it after the click returns, so not at once. */
const LINK_LIFE_MS = 60_000

/**
 * Fetch the writer, build the file and hand it to the browser. Only here is
 * report-export imported, and only on a tap (plan A19): opening Reports
 * never loads it. The file is made on the phone and never leaves it.
 */
async function downloadCsv(fileName: string, rows: () => readonly Row[]): Promise<void> {
  const { toCsv } = await import('@budget/report-export')
  // The byte-order mark tells Excel the file is UTF-8, so a shop's accents survive.
  const file = new Blob(['\uFEFF', toCsv(rows())], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), LINK_LIFE_MS)
}

/** Download CSV (plan A19): the month's charges, or the Overview's figures, as a file a spreadsheet opens. */
export function DownloadCard({
  report,
  rows,
  categories,
  nameOf,
}: {
  report: Reviewed
  rows: readonly LedgerRow[]
  categories: readonly Category[]
  nameOf: (id: string) => string
}) {
  const [failed, setFailed] = useState(false)
  const month = report.month.slice(0, 7)
  const save = (kind: 'charges' | 'summary') => {
    setFailed(false)
    const build = kind === 'charges' ? () => chargesCsvRows(report, rows, categories) : () => summaryCsvRows(report, nameOf)
    downloadCsv(`budget-${month}-${kind}.csv`, build).catch(() => setFailed(true))
  }
  return (
    <div className="print:hidden">
      <Section title="Download CSV" large>
        <p>Keep this month in a spreadsheet: every charge, or the figures above. The file is made on this device.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => save('charges')}>
            Download charges
          </Button>
          <Button variant="outline" onClick={() => save('summary')}>
            Download summary
          </Button>
        </div>
        {failed ? (
          <p role="status">The download did not start. Check your connection and try again; everything else still works.</p>
        ) : null}
      </Section>
    </div>
  )
}
