import { hashOf, type Screen } from '../nav.js'
import { Icon } from '../components/ui/icons.js'
import { cn } from '../lib/cn.js'
import { Count, Dot, labelOf } from './marks.js'
import { SIDEBAR_GROUPS, litOf } from './places.js'

/**
 * The wide screen's navigation (ADR 0011): a 72px rail of icons from
 * 768px, and from 1024px the 248px sidebar with each group's name and
 * each item's word. Hidden below 768px, where the phone bar is.
 */
export function Sidebar({ screen, pendingTotal, dot }: { screen: Screen; pendingTotal: number; dot: boolean }) {
  const lit = litOf(screen)
  const words = 'hidden lg:inline'
  return (
    <aside
      id="sidebar"
      aria-label="Sidebar"
      className="fixed inset-y-0 left-0 z-20 hidden w-[72px] flex-col gap-2 bg-canvas px-3 pb-4 pt-5 md:flex lg:w-[248px] lg:px-4 print:hidden"
    >
      <a href={hashOf({ screen: 'month', param: null })} aria-label="Budget" className="flex items-center justify-center gap-3 rounded-md px-1 pb-3 lg:justify-start">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Icon name="wallet" className="size-5" />
        </span>
        <span className={cn(words, 'text-lg font-semibold tracking-tight')}>Budget</span>
      </a>
      <nav aria-label="Screens" className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto [scrollbar-width:none]">
        {SIDEBAR_GROUPS.map((g, n) => {
          const id = `sidebar-${g.title.toLowerCase()}`
          return (
            <div key={g.title} role="group" aria-labelledby={`${id}-name`} className={cn('flex flex-col gap-0.5', n > 0 && 'border-t pt-3 lg:border-t-0 lg:pt-0')}>
              <p id={`${id}-name`} className={cn(words, 'px-1 pb-1.5 text-[13px] font-medium text-canvas-muted')}>
                {g.title}
              </p>
              <ul id={id} className="flex flex-col gap-0.5">
                {g.items.map((item) => {
                  const active = item.screen === lit
                  return (
                    <li key={item.screen}>
                      <a
                        href={hashOf({ screen: item.screen, param: null })}
                        aria-current={active ? 'page' : undefined}
                        aria-label={labelOf(item, pendingTotal, dot)}
                        title={item.label}
                        className={cn(
                          'relative flex min-h-11 items-center justify-center gap-3 rounded-lg border px-3 text-base font-medium transition-colors lg:justify-start',
                          active ? 'border-border bg-card' : 'border-transparent hover:bg-card',
                        )}
                      >
                        <Icon name={item.icon} className={cn('size-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                        <span className={cn(words, 'min-w-0 flex-1 truncate')}>{item.label}</span>
                        {item.screen === 'review' && pendingTotal > 0 ? (
                          <span className="absolute right-0.5 top-0.5 lg:static">
                            <Count n={pendingTotal} />
                          </span>
                        ) : null}
                        {item.screen === 'coach' && dot ? <Dot className="absolute right-1.5 top-1.5 lg:static" /> : null}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
