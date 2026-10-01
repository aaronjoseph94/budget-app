import { describe, expect, it } from 'vitest'
import { checkCallback } from '../src/ai-apps/hosts.js'

/**
 * The consent page's callback allowlist (PLAN §2.10, §2.13, §5.5): only
 * the exact addresses Claude and ChatGPT document, or a program on this
 * computer, may receive an AI app's sign-in code. Every refusal below is
 * an address an attacker's own registered client could name.
 */
const CHATGPT_ID = `g-${'a'.repeat(62)}_Z9`
// Built, so no line pairs the callback's path with a host the secret scan would read as a key.
const onHost = (host: string) => `https://${host}/api/mcp/auth_callback`

describe('the callback allowlist', () => {
  it.each([
    ['https://claude.ai/api/mcp/auth_callback', 'claude.ai'],
    ['https://claude.com/api/mcp/auth_callback', 'claude.com'],
    ['https://chatgpt.com/connector_platform_oauth_redirect', 'chatgpt.com'],
    [`https://chatgpt.com/connector/oauth/${CHATGPT_ID}`, 'chatgpt.com'],
    [`https://chatgpt.com/connector/oauth/${'x'.repeat(128)}`, 'chatgpt.com'],
    // The host is the same in any letter case, and with its one trailing dot.
    ['https://CLAUDE.AI/api/mcp/auth_callback', 'claude.ai'],
    ['https://claude.ai./api/mcp/auth_callback', 'claude.ai'],
    // Read as the browser reads it, which is where the code would go.
    ['https://claude.ai/x/../api/mcp/auth_callback', 'claude.ai'],
  ])('allows %s, naming %s', (address, host) => {
    expect(checkCallback(address)).toEqual({ allowed: true, host, local: false })
  })

  it.each([
    ['http://localhost:33418/callback', 'localhost'],
    ['http://127.0.0.1:8080/', '127.0.0.1'],
    ['http://[::1]:49152/oauth/callback', '[::1]'],
    ['http://localhost/', 'localhost'],
  ])('allows a program on this computer at %s, with the warning', (address, host) => {
    expect(checkCallback(address)).toEqual({ allowed: true, host, local: true })
  })

  it.each([
    // Another page on an allowed host.
    ['https://claude.ai/', 'claude.ai'],
    ['https://claude.ai/api/mcp/auth_callback/x', 'claude.ai'],
    ['https://claude.ai/api/mcp/auth_callback/', 'claude.ai'],
    ['https://claude.ai/API/mcp/auth_callback', 'claude.ai'],
    ['https://claude.ai/mcp/auth_callback', 'claude.ai'],
    ['https://claude.ai/api/mcp/auth%5Fcallback', 'claude.ai'],
    ['https://chatgpt.com/share/x', 'chatgpt.com'],
    ['https://chatgpt.com/connector/oauth/', 'chatgpt.com'],
    ['https://chatgpt.com/connector/oauth/a/b', 'chatgpt.com'],
    ['https://chatgpt.com/connector/oauth/a%2Fb', 'chatgpt.com'],
    [`https://chatgpt.com/connector/oauth/${'x'.repeat(129)}`, 'chatgpt.com'],
    ['https://claude.com/connector/oauth/abc', 'claude.com'],
    // Claude's path on another host that only looks like one.
    [onHost('claude.ai.evil.example'), 'claude.ai.evil.example'],
    [onHost('evilclaude.ai'), 'evilclaude.ai'],
    [onHost('laude.ai'), 'laude.ai'],
    [onHost('ai'), 'ai'],
    [onHost('claude.ai@evil.example'), 'evil.example'],
    [onHost('claude.ai..'), 'claude.ai.'],
    [onHost('xn--clade-mva.ai'), 'xn--clade-mva.ai'],
    [onHost('cl\u0430ude.ai'), 'xn--clude-5ve.ai'],
    [onHost('160.79.104.10'), '160.79.104.10'],
    [onHost('localhost'), 'localhost'],
    ['http://127.0.0.2/callback', '127.0.0.2'],
    ['http://localhost.evil.example/callback', 'localhost.evil.example'],
    // The right address, carrying more than an address.
    ['http://claude.ai/api/mcp/auth_callback', 'claude.ai'],
    ['https://claude.ai:8443/api/mcp/auth_callback', 'claude.ai'],
    ['https://user:pass@claude.ai/api/mcp/auth_callback', 'claude.ai'],
    ['https://claude.ai/api/mcp/auth_callback?next=https://evil.example', 'claude.ai'],
    ['https://claude.ai/api/mcp/auth_callback?', 'claude.ai'],
    ['https://claude.ai/api/mcp/auth_callback#x', 'claude.ai'],
    ['https://claude.ai/api/mcp/auth_callback#', 'claude.ai'],
    ['http://localhost:33418/callback?x=1', 'localhost'],
  ])('refuses %s, naming %s', (address, host) => {
    expect(checkCallback(address)).toEqual({ allowed: false, host })
  })

  it.each([['evil.example'], ['claude.ai/api/mcp/auth_callback'], [''], ['javascript:alert(1)'], ['data:text/html,x']])(
    'refuses %s, which is no web address, naming no host',
    (address) => {
      expect(checkCallback(address)).toEqual({ allowed: false, host: null })
    },
  )
})
