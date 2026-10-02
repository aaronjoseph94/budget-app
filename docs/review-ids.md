# Review ids cited in the code

Code comments cite review findings by id, e.g. `(PERF-3)`. The audits that
defined them were working files and are not kept, so this table says where
each id's fix landed: the first commit whose message names it. `git show
<commit>` gives the reasoning (architecture-b-12).

- **CR** code review, **DT** design and test review, **FE** front-end
  review (accessibility and behaviour), **PERF** performance review, **SEC**
  security review; `-NEW` marks a finding raised by the re-review of a fix.
- From 2026-10-01 the reviews' ids are long (`backend-a-01`,
  `security-b-06`, `architecture-c1-01`); each commit that fixes one ends
  with `Finding: <id>`, so `git log --grep='<id>'` finds it.
- `N…` ids are entries in NOTICED-NOT-TOUCHING.md; `F…` and `D…` are
  docs/formula-decisions.md and docs/divergences.md.

Regenerate after adding a cited id: for each id, `git log --reverse
--format='%h %s' -E --grep='(^|[^A-Z0-9-])<id>([^0-9A-Z-]|$)' | head -1`.

| Id | Fixed in | Cited first in |
|---|---|---|
| CR-1 | `f51d75b` Keep only the newest refresh of the shared data | `apps/web/src/app-data.tsx` |
| CR-2 | `a617e68` Draw the six blocks, the imported-through line and the transfers note once | `apps/web/src/screens/MonthScreen.tsx` |
| CR-4 | `570d193` Say so when an extra debt payment is refused after its sheet closes | `apps/web/src/screens/DebtExtras.tsx` |
| CR-5 | `18cf548` Refuse a weekly budget in Settings in words, as the Week does | `apps/web/src/app-data.tsx` |
| CR-6 | `55f4a19` Test removing, finding and paging through All transactions | `apps/web/test/add-csv-photo.test.tsx` |
| CR-7 | `ae75085` Say so when a statement file cannot be read, or the account is not in | `apps/web/src/screens/AddScreen.tsx` |
| CR-9 | `f945a49` Name a month, or a day without its year, in one place each | `apps/web/src/format.ts` |
| CR-10 | `18cf548` Refuse a weekly budget in Settings in words, as the Week does | `apps/web/src/screens/WeekScreen.tsx` |
| CR-11 | `e62eabc` Retire ui.tsx's shims and ImportScreen's dead wrapper | `apps/web/src/components/ui/form.tsx` |
| CR-13 | `0caf539` Keep an approved Review card from coming back when an old read lands (A27) | `apps/web/src/screens/ReviewScreen.tsx` |
| CR-14 | `d3da189` Mark refused fields through one helper, and tie the editors' refusals (A27) | `apps/web/src/components/ui/form.tsx` |
| DT-1 | `24eb1a9` Look the card account up once a session, not create it on every refresh | `apps/web/src/ledger.ts` |
| DT-4 | `96fedfb` Stop the Week, Settings and a PDF preview skipping from h1 to h3 | `apps/web/test/heading-order.test.tsx` |
| DT-6 | `a9ee8c0` Keep the Statement tab's icon whole at 320px | `apps/web/src/screens/AddScreen.tsx` |
| DT-6-N1 | `699d9b9` Show Add's tab icons from 360 px, so "Statement" fits its tab at 320 (A27) | `apps/web/src/screens/AddScreen.tsx` |
| FE-1 | `ade9afa` Give every control a 44px touch target on phones and tablets | `apps/web/src/auth.tsx` |
| FE-2 | `40ef52c` Make "I spent / I received" a radio pair with a visible mark | `apps/web/src/screens/AddScreen.tsx` |
| FE-3 | `a7e5583` Show keyboard focus on the file pickers and Setup's move control | `apps/web/src/screens/AddScreen.tsx` |
| FE-4 | `83f818e` Draw the keyboard focus ring at full strength, in the primary teal | `apps/web/src/add/JustTypeIt.tsx` |
| FE-4-NEW | `27c199a` Set the focus ring apart from a filled button's own colour (A27) | `apps/web/src/components/ui/button.tsx` |
| FE-5 | `6db48ae` Draw field borders at 3:1, so each field shows where it is | `apps/web/src/index.css` |
| FE-6 | `c3a0431` Put focus back where it was when an editor closes or an action ends | `apps/web/src/auth.tsx` |
| FE-7 | `8a7f012` Show no screen until the shared data is read, and offer Try again | `apps/web/src/App.tsx` |
| FE-7-NEW | `e3ac069` Offer Sign out, and name the page, when the first load is refused (A27) | `apps/web/src/App.tsx` |
| FE-7-NEW-2 | `e3ac069` Offer Sign out, and name the page, when the first load is refused (A27) | `apps/web/src/App.tsx` |
| FE-8 | `a17045e` Tie form messages to their fields, and say what Add is still missing | `apps/web/src/components/ui/form.tsx` |
| FE-9 | `c64320a` Keep every field's text at 16px on touch screens, so iPhone does not zoom | `apps/web/src/index.css` |
| FE-10 | `69d5178` Add a "Skip to content" link ahead of the screens bar | `apps/web/src/App.tsx` |
| FE-11 | `c44f368` Make the Year's balances a valid description list | `apps/web/src/screens/YearGlance.tsx` |
| FE-12 | `96fedfb` Stop the Week, Settings and a PDF preview skipping from h1 to h3 | `apps/web/src/components/ui/card.tsx` |
| FE-13 | `4320de3` Name each screen in the page title, and move focus to a screen chosen | `apps/web/src/App.tsx` |
| FE-14 | `98c3152` Make the sign-in page a main landmark | `apps/web/src/auth.tsx` |
| FE-15 | `6a766f7` Give Add's tabs the keys and links a tab list promises | `apps/web/src/screens/AddScreen.tsx` |
| FE-16 | `bcaccac` Read success messages out through one status region that is always there | `apps/web/src/components/ui/announce.tsx` |
| FE-17 | `ec3b68b` Let rows and titles wrap when text is enlarged to 200% | `apps/web/src/components/ui/type.tsx` |
| FE-19 | `d718246` Move the CSV column mapping out of ImportScreen into a hook | `apps/web/src/ImportScreen.tsx` |
| FE-20 | `7911ec8` Make the screens bar and More's items links to their addresses | `apps/web/src/App.tsx` |
| PERF-1 | `91c35c8` Draw the review queue 25 cards at a time, and redraw only the card touched | `apps/web/src/screens/ReviewScreen.tsx` |
| PERF-2 | `24eb1a9` Look the card account up once a session, not create it on every refresh | `apps/web/src/app-data.tsx` |
| PERF-3 | `cb97eaa` Fetch every screen but the Month when it is first opened | `apps/web/src/shell/screens.tsx` |
| PERF-4 | `4b192cc` Open a busy category's charges 30 at a time | `apps/web/src/screens/LearnedShops.tsx` |
| PERF-5 | `da98ad5` Filter All transactions a moment behind the search field | `apps/web/src/screens/LedgerScreen.tsx` |
| PERF-6 | `ac1496c` Preload the Month's title font with the page | `scripts/check-bundle.mjs` |
| PERF-7 | `f55f04f` Let a phone keep the hashed build files for a year | `apps/web/public/_headers` |
| PERF-8 | `f0b97b1` Gate the JavaScript a phone loads before the first screen at 200 KB | `scripts/check-bundle.mjs` |
| PERF-9 | `fdb5a4d` Encode a shrunk receipt photo off the main thread | `apps/web/src/receipt.ts` |
| PERF-10 | `504caf8` Move focus to the first thing "Show all" and "Show the last" drew (A27) | `apps/web/src/lib/return-focus.ts` |
| SEC-1 | `3577ed0` Send a Content-Security-Policy from both hosts | `apps/web/public/_headers` |
| SEC-2 | `ec493f2` Send HSTS and a Permissions-Policy from both hosts | `apps/web/public/_headers` |
| SEC-4 | `c04d88f` Compile in only the two public values, and gate against any other | `apps/web/src/env.ts` |
| SEC-5 | `d17d486` Sign in by emailed link with a one-time code, not tokens in the URL | `apps/web/src/auth.tsx` |
| SEC-7 | `3958826` Serve the dev app to this machine only | `apps/web/vite.config.ts` |
| SEC-NEW-1 | `87db119` Stop zod probing for eval under the page's security policy (A27) | `apps/web/src/env.ts` |
| SEC-NEW-2 | `7b18cd2` Say why a sign-in link did not sign in, and clear its code (A27) | `apps/web/src/auth.tsx` |
