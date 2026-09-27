import { describe, expect, it } from 'vitest'
import { similarMerchant } from '../src/index.js'

// Shop names are invented. The hint is for Review with AI off (plan A21):
// picked on the screen, never stored, never an approval.
describe('similarMerchant hints at a learned shop that starts the same way', () => {
  it('hints at the learned shop sharing a first word of four or more letters', () => {
    expect(similarMerchant('SHELL OIL 57444', ['SHELL C04216', 'CORNER MARKET'])).toBe('SHELL C04216')
  })

  it('compares the tidied names, so a processor prefix or a case makes no difference', () => {
    expect(similarMerchant('sq *Blue Bottle Cafe', ['BLUE BOTTLE COFFEE'])).toBe('BLUE BOTTLE COFFEE')
  })

  it('does not hint on a shared short word alone', () => {
    expect(similarMerchant('THE KEG', ['THE BAY'])).toBeNull()
    expect(similarMerchant('A&W DOWNTOWN', ['A&W NORTH'])).toBeNull()
  })

  it('counts a short word once a longer one is shared with it', () => {
    expect(similarMerchant('THE CORNER STORE', ['THE CORNER BAKERY', 'THE BAY'])).toBe('THE CORNER BAKERY')
  })

  it('prefers the learned shop sharing the most leading words', () => {
    expect(similarMerchant('AMAZON PRIME VIDEO', ['AMAZON MKTPLACE', 'AMAZON PRIME'])).toBe('AMAZON PRIME')
  })

  it('leaves a tie unhinted', () => {
    expect(similarMerchant('COSTCO ONLINE', ['COSTCO WHOLESALE', 'COSTCO GAS'])).toBeNull()
  })

  it('needs the words at the start, in order', () => {
    expect(similarMerchant('RED DEER SHELL', ['SHELL'])).toBeNull()
    expect(similarMerchant('MARKET CORNER', ['CORNER MARKET'])).toBeNull()
  })

  it('hints at nothing with nothing learned', () => {
    expect(similarMerchant('SHELL OIL', [])).toBeNull()
  })
})
