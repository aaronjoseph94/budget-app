import { boldParts, type Article } from './articles.js'
import { cn } from '../lib/cn.js'

/**
 * A line of Help as text, with each `**button name**` in bold. Every part
 * is a React text child, so a `<` in an article is drawn as the character.
 */
export function HelpText({ text }: { text: string }) {
  return (
    <>
      {boldParts(text).map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}
    </>
  )
}

/**
 * What the ? sheet and the article page both show: the line on what it is,
 * the numbered steps, and the words an article explains. The article page
 * sets the steps in a card of their own (`carded`, Mockup A); the sheet is
 * already one.
 */
export function ArticleBody({ article, carded = false }: { article: Article; carded?: boolean }) {
  return (
    <div className="space-y-4">
      <p className={cn('text-muted-foreground', carded && 'text-base')}>
        <HelpText text={article.summary} />
      </p>
      <ol className={cn('list-decimal space-y-2 pl-6 marker:font-semibold', carded && 'rounded-xl border bg-card py-5 pl-11 pr-6')}>
        {article.steps.map((step) => (
          <li key={step} className="pl-1">
            <HelpText text={step} />
          </li>
        ))}
      </ol>
      {article.terms === undefined ? null : (
        <dl className="divide-y rounded-xl border bg-card text-sm">
          {article.terms.map((t) => (
            <div key={t.term} className="space-y-0.5 px-4 py-3">
              <dt className="font-semibold [overflow-wrap:anywhere]">{t.term}</dt>
              <dd className="text-muted-foreground">{t.meaning}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
