# PRD 02 — One Settings screen: Lists · Budgets & goals · AI · Account

2026-10-08. Owner decision 3 of six (binding): "One Settings screen with
four tabs: Lists (today's Setup) · Budgets & goals · AI (today's AI
settings) · Account (learned shops, AI apps, sign out). The Setup screen
and name go away. Sidebar group 'Setup' becomes 'More': Settings, Help."
Decision 6: Getting started is a first-run guide, opened from Help and on
first run; no Settings card. Recorded as ADR 0014 §2.

## Problem statement

Three screens set the app up: Setup ("Start here!": lists, bills, pay
days), Settings (weekly budgets, goals, learned shops, AI apps, account,
plus three cards that only linked elsewhere) and AI settings, under a
sidebar group also called Setup, with a guide beside them. They read as
one thing split three ways, and "Setup" named a screen, a group and a
Help article.

## Solution

One Settings screen with a tab bar: Lists · Budgets & goals · AI ·
Account. The tab is in the address (`#/settings/lists`); a bare
`#/settings` opens the tab last seen. `#/setup` and `#/ai` open their
tabs. The sidebar's last group is More: Settings, Help; the phone's More
screen groups the same two as Settings and help. Getting started opens on
the first run and from Help's Start here, with its progress line.

## User stories

1. As the owner, I want one Settings screen, so that everything I set up
   is in one place with four short names.
2. As the owner, I want the tab I was on back after a refresh or the back
   gesture, and the sidebar's Settings to open where I left it.
3. As the owner, I want my old bookmarks and Help links (`#/setup`,
   `#/ai`) to keep working.
4. As a keyboard user, I want the arrow keys, Home and End to move along
   the four tabs, with one tab stop.
5. As a screen-reader user, I want one page title, the tabs as a tablist
   with the chosen one selected, and the panel named by its tab.
6. As the owner, I want Getting started out of my way once I have set up,
   but one tap away in Help.

## Implementation decisions

- `settings/tab.ts` names the four ids, their names, and remembers the
  last tab seen (`budget.settings.tab`), as `reports/tab.ts` does.
- `nav.ts` reads `#/settings/<tab>` only for the four ids; `#/setup` and
  `#/ai` read as Settings tabs (`OLD`), and `useAddress` writes the new
  address over the old one.
- `SettingsScreen` draws the bar as Reports does; Lists and AI are lazy
  parts. Budgets & goals and Account are the cards Settings already had.
- The AI tab draws `AiSettingsScreen`, which has no title row of its own.
  (Until the merge of 2026-10-08 it was drawn through `settings/AiTab.tsx`,
  which hid the AI tree's title by CSS, and `ai` stayed a screen id, never
  drawn; both went at the merge, NOTICED N171.)
- `SCREEN_HELP.settings` is Lists' article; the `?` takes the showing
  tab's (`SETTINGS_TAB_HELP`).
- Getting started's parent is Help (`PARENT` in `shell/places.ts`); Help's
  Start here article carries the way in and the progress line.
- Every sentence that said "in Setup" says "in Lists"; the buttons say
  "Open Lists".

## Testing decisions

- Through the screen with a `tab` prop and through the shell at the
  addresses (`settings-tabs.test.tsx`): tab order and selection, panels,
  keys and focus, the remembered tab, refused storage, the old addresses
  and their rewrite, the `?`'s article, the crumb.
- The existing Settings, Lists, shell, sidebar, Help and screen tests are
  retargeted, not loosened; the Getting started card test on Settings and
  the More row test are replaced by the Start here card test.
- Each sentence test quotes the new words.

## Out of scope

- AI settings' own layout and words (the AI tree, ADR 0015).
- The Help rewrite to about twelve articles (a later wave); articles are
  kept accurate meanwhile.
- Removing the `ai` screen id and `AiTab.tsx`: the merge (done 2026-10-08).

## Done when

- `./scripts/gates.sh full` prints `status=GREEN`.
- At 390 px the four tabs fit without the edge fade; at 1440 px the
  sidebar's last group reads More: Settings, Help.
- No screen, test, Help article, Mockup A note, HANDOFF or setup.md line
  names Setup as a screen or AI settings as a screen's way in.
