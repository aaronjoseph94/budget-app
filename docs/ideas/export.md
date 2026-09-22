# Export: Excel and PDF

## Problem

The user wants everything exportable to Excel and PDF, "with beautiful charts
and figures". Two different jobs wearing one word:

- **Excel** — the data, live and pivotable. He came from a spreadsheet; the
  export is the promise that his data is never trapped in this app.
- **PDF** — a report. Fixed, printable, shareable, looks considered.

## The architectural consequence

A chart must not be a React component, or it can only be drawn on a screen.

Every chart is instead **a pure function from engine output to an SVG string**,
living in `chart-specs` with no React, no DOM, and no react-native dependency.
One implementation then serves three destinations:

```
                      ┌─→ react-native-svg   → screen (iOS + web)
engine output → SVG ──┼─→ embedded directly  → PDF
                      └─→ rasterised to PNG  → Excel
```

Drawn once, correct everywhere. A chart that looks right on the phone and wrong
in the PDF is the failure mode this prevents, and it is the normal outcome when
charts are components.

It also makes chart layout testable. `sankeyLayout(flows)` returning node and
link coordinates is pure arithmetic — it can be golden-tested like any other
calculation, which is not true of a component that only exists once rendered.

## Where it runs

**Client-side, dynamically imported.** The export libraries are large and are
needed only when the user taps Export, so they stay out of the entry chunk
(CONSTRAINTS.md). Generating locally also means a full financial export is
never transmitted anywhere to be rendered.

## Excel export

One workbook, sheets mirroring the app:

| Sheet | Contents |
|---|---|
| Summary | Income, expenses, saved, goal progress, debt-free date |
| Transactions | The full ledger — date, category, merchant, amount, source |
| Weekly | Week-by-week budget vs. actual, limits, streak |
| Monthly | Month rollups per category |
| Bills | Recurring commitments with due days |
| Debt | Per-debt amortization schedules |
| Goals | Contributions and projections |
| Charts | Rendered figures |

Real cell values, not strings — dates as dates, money as numbers with a
currency format — so pivot tables and his own formulas work on arrival.

**Charts in Excel are embedded images, not native Excel chart objects.** Native
charts require hand-writing OOXML chart parts; images are reliable and look
identical to the app. If he later wants charts he can re-point at his own
ranges, that is a separate, larger piece of work, not a default.

## PDF export

A designed report, not a screenshot:

1. Cover — period, headline figures
2. Sankey — where the money went
3. Weekly grid — the contribution squares, with streak
4. Category breakdown — budget vs. actual, over-budget flagged
5. Goal — progress toward the flying fund, in dollars and in hours
6. Debt — balances and payoff projection
7. Appendix — full transaction ledger

Selectable date range. Print-safe: readable in greyscale, no reliance on colour
alone, no dark-mode-only contrast.

## Not Doing

- **No server-side rendering pipeline.** No headless browser, no render service.
  Client-side generation is sufficient at one user's data volume and keeps the
  export off the network.
- **No native Excel chart objects** in v1. See above.
- **No scheduled or emailed reports.** Export is a button, not a subscription.
- **No .docx, no Google Sheets sync, no CSV-per-table.** Two formats, done well.

## Must be true

- Chart specs stay free of React and react-native, or the three-destination
  property collapses and PDF/Excel charts drift from the screen.
- Both libraries must be dynamically imported, or the web entry chunk blows its
  budget.
- Every exported figure comes from `calc-engine`. The export layer formats; it
  never computes. A total that disagrees between the app and the PDF is the
  worst possible bug in a financial document.
