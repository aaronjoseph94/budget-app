import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { ArticleBody } from '../src/help/ArticleBody.js'
import { HelpScreen } from '../src/screens/HelpScreen.js'
import { ARTICLES, type Article } from '../src/help/articles.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'

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
  window.location.hash = ''
})

const titles = () =>
  within(screen.getByRole('list')).getAllByRole('link').map((a) => a.querySelector('.font-medium')?.textContent)

describe('Help', () => {
  it('lists every article in order, each a link to its own address', async () => {
    go('/help')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { level: 1, name: 'Help' })
    expect(titles()).toEqual(ARTICLES.map((a) => a.title))
    const first = within(screen.getByRole('list')).getAllByRole('link')[0]
    expect(first?.getAttribute('href')).toBe('#/help/start')
  })

  it('narrows the list as the owner types, on every word, in any letter case', async () => {
    go('/help')
    renderScreen(<Shell />, createFakeSupabase())
    const search = await screen.findByRole('searchbox', { name: 'Search help' })

    fireEvent.change(search, { target: { value: 'STARTING balance' } })
    expect(titles()).toEqual(['Start here', 'Debts', 'How the forecast works', 'Two month-end figures', 'Why does a number look wrong?'])
    // A button's name counts as its words, without the stars around it.
    fireEvent.change(search, { target: { value: 'add to home screen' } })
    expect(titles()).toEqual(['Put it on your iPhone'])

    fireEvent.change(search, { target: { value: 'zeppelin' } })
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByText('Nothing matches “zeppelin”. Try one word, such as “statement”.')).toBeTruthy()

    fireEvent.change(search, { target: { value: '  ' } })
    expect(titles()).toHaveLength(ARTICLES.length)
  })

  it('shows an article whole: what it is, its steps, when you are done, what to do when stuck, and where next', async () => {
    go('/help/review')
    renderScreen(<Shell />, createFakeSupabase())
    const page = (await screen.findByRole('heading', { level: 1, name: 'Why things wait in Review' })).closest('article')!

    const steps = within(page).getAllByRole('listitem').slice(0, 5)
    expect(steps[3]?.textContent).toBe('Press Approve on a row, or Approve these 12 (with your own number) to file every row that has a category after one look at the list.')
    expect([...(steps[3]?.querySelectorAll('strong') ?? [])].map((b) => b.textContent)).toEqual(['Approve', 'Approve these 12'])
    expect(within(page).getByRole('region', { name: 'You’re done when…' }).textContent).toContain('Review says "Nothing waiting."')
    expect(within(page).getByRole('region', { name: 'Stuck?' }).textContent).toContain('Always file')
    const related = within(within(page).getByRole('region', { name: 'Related' })).getAllByRole('link')
    expect(related.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Bring in a statement', '#/help/statements'],
      ['Add: a statement, a photo, or type it', '#/help/add'],
      ['Why does a number look wrong?', '#/help/wrong-number'],
    ])
    expect(within(page).getByRole('link', { name: '‹ Help' }).getAttribute('href')).toBe('#/help')
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
      id: 'words',
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
    expect(screen.getByText(`<b>${hostile}</b>`).tagName).toBe('DD')
  })
})
