/**
 * The quotes and tips the Coach may show (plan §4, ADR 0005 §8).
 *
 * Committed data, never written by a model: a model may only pick an id it
 * was offered, and the text and author shown always come from here. A
 * quote's text is the words as published in the source named, cut only at
 * a sentence or marked "…"; a tip's text is the app's own short wording of
 * advice the source gives, and says so where it is shown.
 *
 * **Checked when committed** (2026-09-25). Direct fetches of these sites
 * are blocked from where this was built, so each entry was checked by a web
 * search restricted to a site that holds the source itself or documents
 * it (Founders Online, Project Gutenberg, Wikisource and Wikiquote, MIT's
 * Shakespeare, the Internet Archive, The Henry Ford, Quote Investigator, or
 * the author's own site), and `sourceUrls` holds the pages it found. A
 * chapter is named only where that page named it. A line found only on quotation sites was left out:
 * Johnson's "Resolve not to be poor", Sethi's "spend extravagantly", "Big
 * Hat, No Cattle" and "spend what is left after saving". "Compound interest
 * is the eighth wonder of the world" is left out because nothing shows
 * Einstein said it. Nothing here advises on a product or on investing.
 */

/** The closed set a quote is chosen by (plan §4). */
export const QUOTE_TAGS = [
  'small_leaks', 'saving', 'pay_yourself_first', 'hours', 'goal', 'flight', 'courage', 'impulse',
  'enough', 'over_budget', 'debt', 'habits', 'streaks', 'subscriptions', 'levers', 'milestone',
] as const
export type QuoteTag = (typeof QUOTE_TAGS)[number]

export interface LibraryEntry {
  /** Lowercase words and hyphens, no digit, so a model can name one and nothing else. */
  readonly id: string
  readonly kind: 'quote' | 'tip'
  readonly text: string
  /** Who wrote or said it, or, when `often_attributed`, who it is pinned on. */
  readonly by: string
  /** `often_attributed` is shown as "Often attributed to X; not found in their own writing", then the note. */
  readonly attribution: 'wrote' | 'said' | 'often_attributed'
  readonly source: { readonly title: string; readonly year: number | null; readonly locator: string | null }
  /** Where it was checked, https only. */
  readonly sourceUrls: readonly string[]
  /** Required when `often_attributed`: how the attribution is known or disputed. */
  readonly note: string | null
  readonly tags: readonly QuoteTag[]
}

/** Part of the Coach's cache signature (ADR 0005 §6): a change here is a new version. */
export const LIBRARY_VERSION = 1

export const LIBRARY: readonly LibraryEntry[] = [
  {
    id: 'small-leak',
    kind: 'quote',
    text: 'Beware of little Expences; a small Leak will sink a great Ship.',
    by: 'Benjamin Franklin',
    attribution: 'wrote',
    source: { title: 'The Way to Wealth (Poor Richard Improved)', year: 1758, locator: 'Father Abraham’s speech' },
    sourceUrls: ['https://founders.archives.gov/documents/Franklin/01-07-02-0146'],
    note: null,
    tags: ['small_leaks', 'subscriptions', 'levers', 'habits'],
  },
  {
    id: 'penny-saved',
    kind: 'quote',
    text: 'A Penny sav’d is Twopence clear',
    by: 'Benjamin Franklin',
    attribution: 'wrote',
    source: { title: 'Poor Richard’s Almanack', year: 1737, locator: null },
    sourceUrls: ['https://founders.archives.gov/documents/Franklin/01-02-02-0028'],
    note: 'In the almanac’s own spelling. “A penny saved is a penny earned” is a later proverb, not his wording.',
    tags: ['saving', 'small_leaks'],
  },
  {
    id: 'cost-of-a-thing',
    kind: 'quote',
    text: '…the cost of a thing is the amount of what I will call life which is required to be exchanged for it, immediately or in the long run.',
    by: 'Henry David Thoreau',
    attribution: 'wrote',
    source: { title: 'Walden', year: 1854, locator: 'Economy' },
    sourceUrls: ['https://www.gutenberg.org/files/205/205-h/205-h.htm'],
    note: null,
    tags: ['hours', 'levers', 'impulse', 'enough'],
  },
  {
    id: 'annual-income',
    kind: 'quote',
    text: 'Annual income twenty pounds, annual expenditure nineteen nineteen and six, result happiness. Annual income twenty pounds, annual expenditure twenty pounds ought and six, result misery.',
    by: 'Charles Dickens',
    attribution: 'wrote',
    source: { title: 'David Copperfield', year: 1850, locator: 'Chapter 12, Mr. Micawber' },
    sourceUrls: ['https://www.gutenberg.org/files/766/766-h/766-h.htm', 'https://en.wikiquote.org/wiki/David_Copperfield_(novel)'],
    note: null,
    tags: ['over_budget', 'enough', 'debt'],
  },
  {
    id: 'craves-more',
    kind: 'quote',
    text: 'It is not the man who has too little, but the man who craves more, that is poor.',
    by: 'Seneca',
    attribution: 'wrote',
    source: { title: 'Moral Letters to Lucilius, translated by Richard M. Gummere', year: 1917, locator: 'Letter 2' },
    sourceUrls: ['https://en.wikisource.org/wiki/Moral_letters_to_Lucilius/Letter_2'],
    note: null,
    tags: ['enough', 'impulse'],
  },
  {
    id: 'part-of-all-you-earn',
    kind: 'quote',
    text: 'A part of all you earn is yours to keep.',
    by: 'George S. Clason',
    attribution: 'wrote',
    source: { title: 'The Richest Man in Babylon', year: 1926, locator: null },
    sourceUrls: ['https://archive.org/stream/RichestManInBabylon_650/the_richest_man_in_babylon_djvu.txt'],
    note: null,
    tags: ['pay_yourself_first', 'saving', 'goal'],
  },
  {
    id: 'life-energy',
    kind: 'quote',
    text: 'Money is something we choose to trade our life energy for.',
    by: 'Vicki Robin and Joe Dominguez',
    attribution: 'wrote',
    source: { title: 'Your Money or Your Life', year: 1992, locator: null },
    sourceUrls: ['https://vickirobin.com/your-money-or-your-life-summary/'],
    note: null,
    tags: ['hours', 'impulse', 'levers'],
  },
  {
    id: 'show-people',
    kind: 'quote',
    text: 'Spending money to show people how much money you have is the fastest way to have less money.',
    by: 'Morgan Housel',
    attribution: 'wrote',
    source: { title: 'The Psychology of Money', year: 2020, locator: null },
    sourceUrls: ['https://collabfund.com/blog/a-few-beliefs/'],
    note: null,
    tags: ['impulse', 'enough', 'saving'],
  },
  {
    id: 'level-of-your-systems',
    kind: 'quote',
    text: 'You do not rise to the level of your goals. You fall to the level of your systems.',
    by: 'James Clear',
    attribution: 'wrote',
    source: { title: 'Atomic Habits', year: 2018, locator: null },
    sourceUrls: ['https://jamesclear.com/quotes/you-do-not-rise-to-the-level-of-your-goals-you-fall-to-the-level-of-your-systems'],
    note: null,
    tags: ['habits', 'streaks', 'goal'],
  },
  {
    id: 'watch-the-birds',
    kind: 'quote',
    text: 'It is very much the same in learning to ride a flying machine; if you are looking for perfect safety, you will do well to sit on a fence and watch the birds; but if you really wish to learn, you must mount a machine and become acquainted with its tricks by actual trial.',
    by: 'Wilbur Wright',
    attribution: 'said',
    source: { title: 'Some Aeronautical Experiments', year: 1901, locator: 'Address to the Western Society of Engineers, Chicago' },
    sourceUrls: ['https://www.thehenryford.org/collections-and-research/digital-collections/artifact/379642/'],
    note: null,
    tags: ['flight', 'courage', 'goal'],
  },
  {
    id: 'tasted-flight',
    kind: 'quote',
    text: 'Once you have tasted flight, you will forever walk the earth with your eyes turned skyward, for there you have been, and there you will always long to return.',
    by: 'Leonardo da Vinci',
    attribution: 'often_attributed',
    source: { title: 'Quote Investigator', year: 2019, locator: null },
    sourceUrls: ['https://quoteinvestigator.com/2019/01/07/flight/'],
    note: 'Quote Investigator traces it to John H. Secondari, who wrote it for a 1965 educational film, imagining what Leonardo thought.',
    tags: ['flight', 'goal', 'milestone', 'hours'],
  },
  {
    id: 'impress-people',
    kind: 'quote',
    text: 'Americanism: Using money you haven’t earned to buy things you don’t need to impress people you don’t like.',
    by: 'Robert Quillen',
    attribution: 'wrote',
    source: { title: 'Quillen’s Quips (a newspaper column)', year: 1928, locator: '4 June 1928' },
    sourceUrls: ['https://quoteinvestigator.com/2016/04/21/impress/'],
    note: 'Often credited to Will Rogers; Quote Investigator found it in Quillen’s column.',
    tags: ['impulse', 'debt', 'enough'],
  },
  {
    id: 'neither-a-borrower',
    kind: 'quote',
    text: 'Neither a borrower nor a lender be;\nFor loan oft loses both itself and friend,\nAnd borrowing dulls the edge of husbandry.',
    by: 'William Shakespeare',
    attribution: 'wrote',
    source: { title: 'Hamlet', year: 1603, locator: 'Act 1, Scene 3, Polonius' },
    sourceUrls: ['https://shakespeare.mit.edu/hamlet/hamlet.1.3.html'],
    note: null,
    tags: ['debt'],
  },
]
