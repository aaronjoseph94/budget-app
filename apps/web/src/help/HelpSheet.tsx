import { hashOf } from '../nav.js'
import { Sheet } from '../components/ui/sheet.js'
import { articleFor } from './articles.js'
import { ArticleBody } from './ArticleBody.js'
import type { HelpTopic } from './topics.js'

/**
 * A screen's article in a bottom sheet: what it is and its steps, then
 * **Show me** for the whole article, with "You're done when…", "Stuck?"
 * and where to go next. Every built screen's topic has an article (the
 * tests hold it); were one missing, Show me would open the Help list.
 */
export function HelpSheet({ topic, onClose }: { topic: HelpTopic; onClose: () => void }) {
  const article = articleFor(topic)
  return (
    <Sheet title={article?.title ?? 'Help'} onClose={onClose}>
      <div className="space-y-4 p-4">
        {article === undefined ? null : <ArticleBody article={article} />}
        <a
          href={hashOf({ screen: 'help', param: topic })}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Show me
        </a>
      </div>
    </Sheet>
  )
}
