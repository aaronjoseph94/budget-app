import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { ArticleBody } from '../src/help/ArticleBody.js'
import { HelpScreen } from '../src/screens/HelpScreen.js'
import { ARTICLES, type Article } from '../src/help/articles.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

beforeAll(() => warmScreen('#/help', 'Help'))

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.location.hash = ''
})

/** The screen's own part of the page, past the sidebar's lists; the whole page where Help is drawn alone. */
const onScreen = () => within(screen.queryByRole('main') ?? document.body)
const titles = () =>
  within(onScreen().getByRole('list')).getAllByRole('link').map((a) => a.querySelector('.font-medium')?.textContent)

describe('Help', () => {
  it('lists every article in order, each a link to its own address', async () => {
    go('/help')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { level: 1, name: 'Help' })
    expect(titles()).toEqual(ARTICLES.map((a) => a.title))
    const first = within(onScreen().getByRole('list')).getAllByRole('link')[0]
    expect(first?.getAttribute('href')).toBe('#/help/start')
    await expectNoAxeViolations()
  })

  it('narrows the list as the owner types, on every word, in any letter case', async () => {
    go('/help')
    renderScreen(<Shell />, createFakeSupabase())
    const search = await screen.findByRole('searchbox', { name: 'Search help' })

    fireEvent.change(search, { target: { value: 'STARTING balance' } })
    expect(titles()).toEqual(['Debts'])
    // A button's name counts as its words, without the stars around it.
    fireEvent.change(search, { target: { value: 'add to home screen' } })
    expect(titles()).toEqual(['Signing in and out', 'Put it on your iPhone'])
    // The newer articles are found by their own words: getting around, Setup's lists, AI apps.
    fireEvent.change(search, { target: { value: 'sidebar' } })
    expect(titles()).toEqual(['Getting around', 'Signing in and out'])
    fireEvent.change(search, { target: { value: 'Rename' } })
    expect(titles()).toEqual(['Your lists'])
    fireEvent.change(search, { target: { value: 'disconnect' } })
    expect(titles()).toEqual(['Connect Claude or ChatGPT'])

    fireEvent.change(search, { target: { value: 'zeppelin' } })
    expect(onScreen().queryByRole('list')).toBeNull()
    expect(screen.getByText('Nothing matches “zeppelin”. Try one word, such as “statement”.')).toBeTruthy()

    fireEvent.change(search, { target: { value: '  ' } })
    expect(titles()).toHaveLength(ARTICLES.length)
  })

  it('shows an article whole: what it is, its steps, when you are done, what to do when stuck, and where next', async () => {
    go('/help/review')
    renderScreen(<Shell />, createFakeSupabase())
    const page = (await screen.findByRole('heading', { level: 1, name: 'Review' })).closest('article')!

    const steps = within(page).getAllByRole('listitem').slice(0, 7)
    expect(steps[1]?.textContent).toBe('Under Suggested changes, press Apply or Dismiss on each AI app suggestion.')
    expect(steps[4]?.textContent).toBe('Press Approve, or Approve these 12, then Approve all 12.')
    expect([...(steps[4]?.querySelectorAll('strong') ?? [])].map((b) => b.textContent)).toEqual(['Approve', 'Approve these 12', 'Approve all 12'])
    expect(within(page).getByRole('region', { name: 'You’re done when…' }).textContent).toContain('Review says “Nothing waiting.”')
    // Side by side, the two cards stretch to one height (V18).
    expect(within(page).getByRole('region', { name: 'You’re done when…' }).parentElement?.className).not.toContain('items-start')
    expect(within(page).getByRole('region', { name: 'Stuck?' }).textContent).toContain('Shops filed by themselves')
    const related = within(within(page).getByRole('region', { name: 'Related' })).getAllByRole('link')
    expect(related.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Add a charge: statement, photo, typed', '#/help/add'],
      ['Connect Claude or ChatGPT', '#/help/ai-apps'],
    ])
    expect(within(page).getByRole('link', { name: '‹ Help' }).getAttribute('href')).toBe('#/help')
  })

  it('opens Getting started from Start here, and from no other article (decision 6)', async () => {
    go('/help/start')
    renderScreen(<Shell />, createFakeSupabase())
    const page = (await screen.findByRole('heading', { level: 1, name: 'Start here' })).closest('article')!
    const card = within(page).getByRole('region', { name: 'Getting started' })
    expect(within(card).getByRole('link', { name: 'Open Getting started' }).getAttribute('href')).toBe('#/start')
    // The guide's way in comes before the words about it.
    expect(card.compareDocumentPosition(within(page).getAllByRole('list')[0]!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    go('/help/review')
    await screen.findByRole('heading', { level: 1, name: 'Review' })
    expect(screen.queryByRole('link', { name: 'Open Getting started' })).toBeNull()
  })

  // Mockup A: from 1024px an article has the list beside it, the one open lit.
  it('sets the list beside an article on a wide screen, its own article marked as the page', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(min-width: 1024px)', addEventListener: () => undefined, removeEventListener: () => undefined }))
    go('/help/review')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { level: 1, name: 'Review' })
    expect(onScreen().getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const list = onScreen().getByRole('navigation', { name: 'Help articles' })
    const links = within(list).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(ARTICLES.map((a) => a.title))
    expect(links.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.getAttribute('href'))).toEqual(['#/help/review'])
    // The list is the way back, so the article drops its own.
    expect(onScreen().queryByRole('link', { name: '‹ Help' })).toBeNull()
    fireEvent.change(within(list).getByRole('searchbox', { name: 'Search help' }), { target: { value: 'add to home screen' } })
    expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual(['Signing in and out', 'Put it on your iPhone'])
    // cn is a plain join: the carded steps carry one left padding, not two.
    const steps = onScreen().getByRole('article').querySelector('ol')!
    expect(steps.className.split(' ').filter((c) => c.startsWith('pl-'))).toEqual(['pl-11'])
    // Only the sign-in card has a shadow (Mockup A).
    expect(onScreen().getByRole('article').closest('main')!.querySelectorAll('[class*="rounded-xl"][class*="shadow"]')).toHaveLength(0)
    await expectNoAxeViolations()
  })

  it('opens the list, saying so, for a topic whose article is not written yet', async () => {
    // Ask's article (A24) was the last one missing, so no committed topic lacks one:
    // a topic the screen has no article for is handed to it directly.
    renderScreen(<HelpScreen topic="not-written-yet" />, createFakeSupabase())
    await screen.findByRole('heading', { level: 1, name: 'Help' })
    expect(screen.getByText('That page is not written yet. Here is everything that is.').getAttribute('role')).toBe('status')
    expect(titles()).toHaveLength(ARTICLES.length)
  })
})

describe('an article’s words', () => {
  it('are drawn as text, never as markup, even inside a button’s name', () => {
    const hostile = '<img src=x onerror="alert(1)">'
    const article: Article = {
      id: 'review',
      title: 'Test',
      summary: `${hostile} summary`,
      steps: [`Press **${hostile}**.`],
      done: 'done',
      stuck: 'stuck',
      related: [],
      terms: [{ term: hostile, meaning: `<b>${hostile}</b>` }],
    }
    const { container } = render(<ArticleBody article={article} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText(`${hostile} summary`)).toBeTruthy()
    expect(within(screen.getByRole('listitem')).getByText(hostile).tagName).toBe('STRONG')
    expect(screen.getByText(`<b>${hostile}</b>`).closest('dd')).not.toBeNull()
  })

  // e2e-setup-05: "Its sign-in" read "which **Disconnect** should do", stars and all.
  it('draws a button’s name in a term’s meaning in bold, as the steps do, still as text', () => {
    const hostile = '<img src=x onerror="alert(1)">'
    const article: Article = {
      id: 'review',
      title: 'Test',
      summary: 'summary',
      steps: ['Press **Go**.'],
      done: 'done',
      stuck: 'stuck',
      related: [],
      terms: [{ term: 'Its sign-in', meaning: `until it ends, which **${hostile}** should do` }],
    }
    const { container } = render(<ArticleBody article={article} />)
    const meaning = container.querySelector('dd')!
    expect(meaning.textContent).toBe(`until it ends, which ${hostile} should do`)
    expect(within(meaning).getByText(hostile).tagName).toBe('STRONG')
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows no stars anywhere in any article', () => {
    for (const article of ARTICLES) {
      const { container, unmount } = render(<ArticleBody article={article} />)
      expect(container.textContent, article.id).not.toContain('**')
      unmount()
    }
  })
})
