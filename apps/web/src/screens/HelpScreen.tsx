import { useRef, useState, type RefObject } from 'react'
import { articleFor, searchArticles, type Article } from '../help/articles.js'
import { hashOf } from '../nav.js'
import { Input } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { MonthTitle } from '../components/ui/type.js'
import { ArticleBody, HelpText } from '../help/ArticleBody.js'
import { UpdatesPanel } from '../help/UpdatesPanel.js'
import { useHelpSearchFocus } from '../help/search-focus.js'
import { useWide } from '../lib/wide.js'
import { cn } from '../lib/cn.js'

/**
 * Help (plan §8.2): `#/help` lists every article with a search box, and
 * `#/help/<topic>` shows one. A topic whose article is not written yet (it
 * belongs to a screen still on its way) opens the list, with a line saying
 * so, rather than an empty page. From 1024px an article has the list
 * beside it (Mockup A), drawn only there, so a phone builds one of them.
 */
export function HelpScreen({ topic }: { topic: string | null }) {
  const article = topic === null ? undefined : articleFor(topic)
  const wide = useWide()
  if (article === undefined) return <HelpIndex unwritten={topic !== null} />
  if (!wide) return <ArticlePage article={article} beside={false} />
  return (
    <div className="grid grid-cols-[18rem_minmax(0,1fr)] items-start gap-6 xl:grid-cols-[20rem_minmax(0,1fr)] xl:gap-10">
      <SideIndex current={article.id} />
      <ArticlePage article={article} beside />
    </div>
  )
}

function HelpIndex({ unwritten }: { unwritten: boolean }) {
  const [query, setQuery] = useState('')
  const box = useRef<HTMLInputElement>(null)
  // Only the list standing alone takes the top bar's search: ⌘K opens it.
  useHelpSearchFocus(box)
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="space-y-1">
        <MonthTitle>Help</MonthTitle>
        <p className="text-muted-foreground">Short answers, one step at a time.</p>
      </header>
      {unwritten ? (
        <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
          That page is not written yet. Here is everything that is.
        </p>
      ) : null}
      <SearchBox box={box} query={query} onQuery={setQuery} />
      <IndexList query={query} current={null} />
    </div>
  )
}

/** The list beside an article: the same search and titles, the one open lit. */
function SideIndex({ current }: { current: string }) {
  const [query, setQuery] = useState('')
  const box = useRef<HTMLInputElement>(null)
  return (
    <nav aria-label="Help articles" className="space-y-4">
      {/* Not a heading: the article's title is the page's h1. */}
      <div className="space-y-1">
        <p className="text-[2rem] font-bold leading-tight tracking-[-0.02em]">Help</p>
        <p className="text-muted-foreground">Short answers, one step at a time.</p>
      </div>
      <SearchBox box={box} query={query} onQuery={setQuery} />
      <IndexList query={query} current={current} />
    </nav>
  )
}

function SearchBox({ box, query, onQuery }: { box: RefObject<HTMLInputElement | null>; query: string; onQuery: (q: string) => void }) {
  return (
    <Input
      ref={box}
      type="search"
      aria-label="Search help"
      placeholder="Search help, such as “budget”"
      value={query}
      onChange={(e) => onQuery(e.target.value)}
      autoComplete="off"
      spellCheck={false}
    />
  )
}

/** Every article matching the search; beside an article, titles alone. */
function IndexList({ query, current }: { query: string; current: string | null }) {
  const found = searchArticles(query)
  if (found.length === 0) {
    return (
      <p role="status" className="py-4 text-sm text-muted-foreground">
        Nothing matches “{query.trim()}”. Try one word, such as “statement”.
      </p>
    )
  }
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {found.map((a) => (
        <li key={a.id}>
          <a
            href={hashOf({ screen: 'help', param: a.id })}
            aria-current={a.id === current ? 'page' : undefined}
            className={cn(
              'flex min-h-11 w-full items-center gap-3 px-4 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              current === null ? 'py-3.5' : 'py-3 text-sm',
              a.id === current && 'bg-primary-tint hover:bg-primary-tint',
            )}
          >
            <span className="min-w-0 flex-1">
              <span className={cn('block', a.id === current ? 'font-semibold' : 'font-medium')}>{a.title}</span>
              {current === null ? <span className="block text-sm text-muted-foreground">{a.summary}</span> : null}
            </span>
            <Icon name="chevronRight" className="size-4 shrink-0 text-muted-foreground" />
          </a>
        </li>
      ))}
    </ul>
  )
}

function ArticlePage({ article, beside }: { article: Article; beside: boolean }) {
  return (
    <article className={cn('space-y-5', !beside && 'mx-auto max-w-3xl')}>
      <header className="space-y-1">
        {/* Beside the list, the list is the way back. */}
        {beside ? null : (
          <a
            href={hashOf({ screen: 'help', param: null })}
            className="-ml-1 inline-flex min-h-11 items-center px-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ‹ Help
          </a>
        )}
        <MonthTitle>{article.title}</MonthTitle>
      </header>
      {/* What is in comes first: it is what the owner opened this page to learn. */}
      {article.id === 'updates' ? <UpdatesPanel /> : null}
      <ArticleBody article={article} carded />
      {/* Stretched, so the two cards side by side are one height (V18). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <section aria-labelledby="help-done" className="space-y-1 rounded-xl border bg-card p-5">
          <h2 id="help-done" className="flex items-center gap-2 font-semibold">
            <Icon name="check" className="size-4 shrink-0 text-primary" />
            You’re done when…
          </h2>
          <p>
            <HelpText text={article.done} />
          </p>
        </section>
        <section aria-labelledby="help-stuck" className="space-y-1 rounded-xl border bg-card p-5">
          <h2 id="help-stuck" className="font-semibold">
            Stuck?
          </h2>
          <p>
            <HelpText text={article.stuck} />
          </p>
        </section>
      </div>
      {article.related.length === 0 ? null : (
        <section aria-labelledby="help-related" className="space-y-2">
          <h2 id="help-related" className="text-sm font-medium text-muted-foreground">
            Related
          </h2>
          <ul className="flex flex-wrap gap-2">
            {article.related.map((id) => (
              <li key={id}>
                <a
                  href={hashOf({ screen: 'help', param: id })}
                  className="inline-flex min-h-11 items-center rounded-full border bg-card px-4 text-sm font-medium hover:bg-accent"
                >
                  {articleFor(id)?.title ?? id}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
