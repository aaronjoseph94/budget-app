import { useRef, useState } from 'react'
import { articleFor, searchArticles, type Article } from '../help/articles.js'
import { hashOf } from '../nav.js'
import { Input } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { ArticleBody, HelpText } from '../help/ArticleBody.js'
import { UpdatesPanel } from '../help/UpdatesPanel.js'
import { useHelpSearchFocus } from '../help/search-focus.js'

/**
 * Help (plan §8.2): `#/help` lists every article with a search box, and
 * `#/help/<topic>` shows one. A topic whose article is not written yet (it
 * belongs to a screen still on its way) opens the list, with a line saying
 * so, rather than an empty page.
 */
export function HelpScreen({ topic }: { topic: string | null }) {
  const article = topic === null ? undefined : articleFor(topic)
  return article === undefined ? <HelpIndex unwritten={topic !== null} /> : <ArticlePage article={article} />
}

function HelpIndex({ unwritten }: { unwritten: boolean }) {
  const [query, setQuery] = useState('')
  const found = searchArticles(query)
  const box = useRef<HTMLInputElement>(null)
  useHelpSearchFocus(box)
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Help</h1>
        <p className="text-sm text-muted-foreground">Short answers, one step at a time.</p>
      </header>
      {unwritten ? (
        <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
          That page is not written yet. Here is everything that is.
        </p>
      ) : null}
      <Input
        ref={box}
        type="search"
        aria-label="Search help"
        placeholder="Search help, such as “budget”"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {found.length === 0 ? (
        <p role="status" className="py-4 text-sm text-muted-foreground">
          Nothing matches “{query.trim()}”. Try one word, such as “statement”.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
          {found.map((a) => (
            <li key={a.id}>
              <a
                href={hashOf({ screen: 'help', param: a.id })}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{a.title}</span>
                  <span className="block text-sm text-muted-foreground">{a.summary}</span>
                </span>
                <Icon name="chevronRight" className="size-4 shrink-0 text-muted-foreground" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ArticlePage({ article }: { article: Article }) {
  return (
    <article className="space-y-5">
      <header className="space-y-1">
        <a
          href={hashOf({ screen: 'help', param: null })}
          className="-ml-1 inline-flex min-h-11 items-center px-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ‹ Help
        </a>
        <h1 className="text-2xl font-semibold tracking-tight">{article.title}</h1>
      </header>
      {/* What is in comes first: it is what the owner opened this page to learn. */}
      {article.id === 'updates' ? <UpdatesPanel /> : null}
      <ArticleBody article={article} />
      <section aria-labelledby="help-done" className="space-y-1 rounded-xl border bg-card p-4 shadow-sm">
        <h2 id="help-done" className="font-semibold">
          You’re done when…
        </h2>
        <p>
          <HelpText text={article.done} />
        </p>
      </section>
      <section aria-labelledby="help-stuck" className="space-y-1 rounded-xl border bg-card p-4 shadow-sm">
        <h2 id="help-stuck" className="font-semibold">
          Stuck?
        </h2>
        <p>
          <HelpText text={article.stuck} />
        </p>
      </section>
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
