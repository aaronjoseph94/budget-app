import { describe, expect, it } from 'vitest'
import cloudflare from '../public/_headers?raw'
import netlify from '../../../netlify.toml?raw'

/**
 * The response headers the two hosts send with every page. Cloudflare
 * Pages reads public/_headers; the Netlify preview reads netlify.toml.
 * The site must be protected the same on either.
 */
function header(text: string, name: string): string | null {
  const line = new RegExp(`^\\s*"?${name}"?\\s*[:=]\\s*"?([^"\\n]*)"?\\s*$`, 'mi').exec(text)
  return line === null ? null : (line[1] ?? '').trim()
}

const csp = header(cloudflare, 'Content-Security-Policy')
const directives = new Map(
  (csp ?? '').split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0] !== '').map(([name = '', ...values]) => [name, values]),
)

describe('Content-Security-Policy (SEC-1)', () => {
  it('runs only the site own scripts, and none written into the page', () => {
    expect(directives.get('default-src')).toEqual(["'self'"])
    expect(directives.get('script-src')).toEqual(["'self'"])
    for (const d of ['object-src', 'base-uri', 'frame-ancestors']) expect(directives.get(d)).toEqual(["'none'"])
  })

  it('lets the page talk to its own Supabase project and nowhere else', () => {
    const project = new URL(header(netlify, 'VITE_SUPABASE_URL') ?? '').origin
    expect(directives.get('connect-src')).toEqual(["'self'", project])
  })

  it('is sent the same by both hosts', () => {
    expect(header(netlify, 'Content-Security-Policy')).toBe(csp)
  })
})

describe('the rest of the headers', () => {
  it('keeps the browser on https for a year, own domain included (SEC-2)', () => {
    expect(header(cloudflare, 'Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains')
    expect(header(netlify, 'Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains')
  })

  it('turns off the device features the app never asks for (SEC-2)', () => {
    const policy = header(cloudflare, 'Permissions-Policy')
    expect(policy).toBe('camera=(), microphone=(), geolocation=(), payment=(), usb=()')
    expect(header(netlify, 'Permissions-Policy')).toBe(policy)
  })
})
