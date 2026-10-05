import { hashOf, type Screen } from '../nav.js'
import { Icon } from '../components/ui/icons.js'
import { cn } from '../lib/cn.js'
import { Count, Dot, RING_INSET, Suggested, labelOf } from './marks.js'
import { SIDEBAR_GROUPS, litOf } from './places.js'
import type { SidebarState } from './sidebar-state.js'
import { SidebarFoot } from './SidebarFoot.js'

/**
 * The wide screen's navigation (ADR 0011): a 72px rail of icons from
 * 768px, and from 1024px, unless folded, the 248px sidebar with each
 * group's name. Plan is always open; the other groups fold, as the owner
 * last left them on this device, and until then open when they hold the
 * screen showing. At its foot, the main goal and the owner. Hidden below
 * 768px, where the phone bar is.
 */
export function Sidebar({
  screen,
  state,
  pendingTotal,
  suggestedTotal = 0,
  dot,
  ready,
}: {
  screen: Screen
  state: SidebarState
  pendingTotal: number
  /** Changes an AI app suggested, waiting in Review (ADR 0013). */
  suggestedTotal?: number
  dot: boolean
  /** Whether the shared data is read, which the foot's goal and name need. */
  ready: boolean
}) {
  const lit = litOf(screen)
  const folded = state.folded
  // Shown only in the full sidebar: from 1024px, and not folded.
  const full = folded ? 'hidden' : 'hidden lg:flex'
  const words = folded ? 'hidden' : 'hidden lg:inline'
  return (
    <aside
      id="sidebar"
      aria-label="Sidebar"
      className={cn(
        'fixed inset-y-0 left-0 z-20 hidden w-[72px] flex-col gap-2 bg-canvas px-3 pb-4 pt-5 md:flex print:hidden',
        !folded && 'lg:w-[248px] lg:px-4',
      )}
    >
      <a href={hashOf({ screen: 'month', param: null })} aria-label="Budget" className={cn(RING_INSET, 'flex items-center justify-center gap-3 rounded-md px-1 pb-3 lg:justify-start')}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Icon name="wallet" className="size-5" />
        </span>
        <span className={cn(words, 'text-lg font-semibold tracking-tight')}>Budget</span>
      </a>
      <nav aria-label="Screens" className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto [scrollbar-width:none]">
        {SIDEBAR_GROUPS.map((g, n) => {
          const id = `sidebar-${g.title.toLowerCase()}`
          const folds = g.title !== 'Plan'
          const open = !folds || state.isOpen(g.title, g.items.some((i) => i.screen === lit))
          const waiting = g.items.some((i) => i.screen === 'review') && pendingTotal > 0
          return (
            <div key={g.title} role="group" aria-labelledby={`${id}-name`} className={cn('flex flex-col gap-0.5', n > 0 && 'border-t pt-3', n > 0 && !folded && 'lg:border-t-0 lg:pt-0')}>
              {folds ? (
                <button
                  id={`${id}-name`}
                  type="button"
                  aria-expanded={open}
                  aria-controls={id}
                  aria-label={!open && waiting ? `${g.title}, ${pendingTotal} waiting` : undefined}
                  onClick={() => state.setOpen(g.title, !open)}
                  className={cn(full, RING_INSET, 'min-h-11 w-full items-center gap-2 rounded-md px-1 text-[13px] font-medium text-canvas-muted hover:text-foreground')}
                >
                  <span className="flex-1 text-left">{g.title}</span>
                  {!open && waiting ? <Count n={pendingTotal} /> : null}
                  <Icon name={open ? 'up' : 'down'} className="size-4" />
                </button>
              ) : (
                <p id={`${id}-name`} className={cn(words, 'px-1 pb-1.5 text-[13px] font-medium text-canvas-muted')}>
                  {g.title}
                </p>
              )}
              {/* Closed, a group's list is hidden in the full sidebar only: the rail shows every item. */}
              <ul id={id} className={cn('flex flex-col gap-0.5', !open && !folded && 'lg:hidden')}>
                {g.items.map((item) => {
                  const active = item.screen === lit
                  return (
                    <li key={item.screen}>
                      <a
                        href={hashOf({ screen: item.screen, param: null })}
                        aria-current={active ? 'page' : undefined}
                        aria-label={labelOf(item, pendingTotal, dot, suggestedTotal)}
                        title={item.label}
                        className={cn(
                          RING_INSET,
                          'relative flex min-h-11 items-center justify-center gap-3 rounded-lg border px-3 text-base font-medium transition-colors',
                          !folded && 'lg:justify-start',
                          active ? 'border-border bg-card' : 'border-transparent hover:bg-card',
                        )}
                      >
                        <Icon name={item.icon} className={cn('size-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                        <span className={cn(words, 'min-w-0 flex-1 truncate')}>{item.label}</span>
                        {item.screen === 'review' && pendingTotal > 0 ? (
                          <span className={cn('absolute right-0.5 top-0.5', !folded && 'lg:static')}>
                            <Count n={pendingTotal} />
                          </span>
                        ) : null}
                        {item.screen === 'review' && suggestedTotal > 0 ? (
                          <span className={cn('absolute bottom-0.5 right-0.5', !folded && 'lg:static')}>
                            <span className={words}>
                              <Suggested n={suggestedTotal} words />
                            </span>
                            <span className={cn(!folded && 'lg:hidden')}>
                              <Suggested n={suggestedTotal} />
                            </span>
                          </span>
                        ) : null}
                        {item.screen === 'coach' && dot ? <Dot className={cn('absolute right-1.5 top-1.5', !folded && 'lg:static')} /> : null}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
      {ready ? <SidebarFoot folded={folded} /> : null}
    </aside>
  )
}
