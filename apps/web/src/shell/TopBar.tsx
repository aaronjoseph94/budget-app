import { hashOf, type Screen } from '../nav.js'
import { Icon } from '../components/ui/icons.js'
import { LINE_BUTTON } from '../components/ui/link.js'
import { cn } from '../lib/cn.js'
import { crumbsOf } from './places.js'
import { RING } from './marks.js'

/**
 * The white panel's top bar, from 768px (ADR 0011): the sidebar toggle,
 * where this screen sits, "Search or jump to…" and + Add. The toggle folds
 * the sidebar to the rail, and shows from 1024px, where there is a
 * sidebar to fold. Search opens Help's search for now; ⌘K and Ctrl+K do
 * the same from anywhere (App.tsx).
 */
export function TopBar({
  screen,
  param,
  folded,
  onFold,
  onSearch,
}: {
  screen: Screen
  param: string | null
  folded: boolean
  onFold: () => void
  onSearch: () => void
}) {
  const crumbs = crumbsOf(screen, param)
  // 44px on a touch screen (plan §9); a mouse keeps the mockup's 36 and 40.
  const tall = 'pointer-coarse:min-h-11 pointer-coarse:min-w-11'
  return (
    <header className="safe-top sticky top-0 z-10 hidden min-h-16 items-center gap-3.5 border-b bg-background px-5 md:flex md:rounded-t-xl print:hidden">
      <button
        type="button"
        aria-label="Toggle sidebar"
        aria-expanded={!folded}
        aria-controls="sidebar"
        onClick={onFold}
        className={cn(RING, 'hidden size-9 items-center justify-center rounded-md hover:bg-accent lg:flex', tall)}
      >
        <Icon name="sidebar" className="size-[18px]" />
      </button>
      <span aria-hidden="true" className="hidden h-5 w-px bg-border lg:block" />
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-2 text-base text-muted-foreground">
          <li>
            <a href={hashOf({ screen: crumbs.parent.screen, param: null })} className={cn(LINE_BUTTON, RING, 'rounded-sm hover:text-foreground')}>
              {crumbs.parent.label}
            </a>
          </li>
          <li aria-hidden="true">
            <Icon name="chevronRight" className="size-3.5" />
          </li>
          <li aria-current="page" className="truncate font-medium text-foreground">
            {crumbs.current}
          </li>
        </ol>
      </nav>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onSearch}
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(RING, 'flex h-10 items-center gap-2.5 rounded-md border px-3 text-[15px] text-muted-foreground hover:bg-accent md:w-[min(360px,30vw)]', tall)}
      >
        <Icon name="search" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">Search or jump to…</span>
        <kbd aria-hidden="true" className="rounded-sm border bg-muted px-1.5 font-sans text-xs">
          ⌘K
        </kbd>
      </button>
      <a
        href={hashOf({ screen: 'add', param: null })}
        className={cn(RING, 'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-[15px] font-medium text-primary-foreground hover:bg-primary/90', tall)}
      >
        <Icon name="plus" className="size-4" />
        Add
      </a>
    </header>
  )
}
