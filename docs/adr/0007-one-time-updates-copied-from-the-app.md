# ADR 0007 — One-time updates, copied from inside the app

**Date:** 2026-09-25 · **Decided by:** the engineer under the owner's
2026-09-24 instruction to proceed without questions · **Status:** accepted
**Plan:** `docs/ai-first-plan.md` §8.2 and slice A09; the helper it copies
is ADR 0004's

## Context

Each new part of the app needs something pasted into Supabase by hand: a
database update into the SQL Editor, and from 0016 on the AI helper into the
Edge Functions editor. Help → One-time updates (A06) checks which are in and
names the next one, then links to that file on GitHub.

The owner asked, on 2026-09-24 (item 5, in their words): "create help
section and expand the setup section so I understand what to do..without
feeling overwhelmed or lost". GitHub is where that goes wrong: on a phone,
a repository page, a Raw button and a thousand-line file to select by hand
are three places to get lost, and the AI helper is about a thousand lines.

Two things constrain the answer:

- **The browser's JavaScript must hold no provider address or service key**
  (CLAUDE.md; plan §3.2). The helper's source names every provider's host,
  and the names of the Supabase secrets it reads, because that is its job.
- **The app never applies an update itself.** That would need the service
  key or a management token in the browser, which CLAUDE.md forbids.

## Options

| Option | Cost |
|---|---|
| A — keep the GitHub links | The owner finds, opens and selects each file by hand; the repository's name is written into the app (N70) |
| B — import each file as text into a lazy chunk (`?raw`) | The helper's source, provider hosts included, becomes a string inside the app's JavaScript, where the static guard must find none; JavaScript escaping means the copy is no longer the committed file byte for byte |
| **C — copy the files into the build as they are, under `/setup/`, and fetch one when Copy is pressed** | A small build plugin; the files are public on the site |
| D — the app applies the update itself | Needs a key that must never reach the browser |

## Decision

**C.** `apps/web/setup-files.ts` is a Vite plugin using Node's `fs`, with no
new dependency:

- **What it copies:** every migration numbered 0015 or later, under its own
  name, and the AI helper (`supabase/functions/ai/index.ts`) as
  `ai-function.ts`. Nothing else: not 0001–0014, which the owner pasted on
  2026-09-24; not `read-receipt`; nothing from the environment. The list is
  worked out from the folder, so 0017 and 0018 join as they land.
- **How:** the build emits each file's bytes unchanged under `setup/`; the
  dev server answers `/setup/<name>` for those names alone, and every other
  path under `/setup/` with 404, so it never falls through to the app's
  other files. A test holds each copy byte for byte to the committed file,
  and the bundle check holds the built `setup/` folder to exactly that list.
- **In the app:** One-time updates shows **Copy** beside the next file when
  it is one of these. The text is fetched when the step shows, so the tap
  itself only writes to the clipboard, which Safari on an iPhone allows only
  during the tap. The app checks the file's first line before offering it:
  a static host answers a path it does not have with the app's own page, and
  that must never be pasted into Supabase. If the clipboard is refused, the
  text is shown in a box to select by hand; if the file cannot be fetched,
  the GitHub link stays as a way round. 0003–0014 keep their GitHub links.
- **The exact Supabase clicks** for the step, the SQL Editor's or the Edge
  Functions editor's, are on the page beside Copy, then **Check again**.

**Why the files may be public.** They hold no secret: gitleaks scans them
where they are committed, and the helper reads its keys from Supabase's
secrets at run time. Reading the schema gives nobody access to a row;
row-level security does that, and the browser's JavaScript was already
enough to learn every table name the app reads.

## Consequences

**Gained**

- One tap copies the exact bytes of the next update; nothing is found,
  opened or selected by hand.
- The app's JavaScript still holds no provider host or service key name, and
  a check proves it on every build (CONSTRAINTS.md).

**Lost**

- The updates and the helper's source are readable by anyone who guesses
  their address. They say nothing a reader could use without a key.
- `/setup/` is served outside `/assets/`, so it is not cached for a year:
  a fetch always gets the copy the site was built with.

**Revisit** if a file under `/setup/` would ever need a secret (it must
not), or if 0003–0014 need copying for a project rebuilt from scratch (N70).
