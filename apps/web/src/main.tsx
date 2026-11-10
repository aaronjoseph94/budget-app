import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.js'
import { restoreAddress } from './nav.js'
import { rememberScroll } from './scroll-memory.js'
import { takeTokensOutOfAddress } from './auth.js'
import { reloadOnceOnPreloadError } from './shell/preload-reload.js'

/** Reading a storage can itself throw (storage blocked), so ask carefully. */
function storage(which: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return window[which]
  } catch {
    return null
  }
}

// A screen's chunk from an older deploy: reload once for the new one (FE-1),
// but not offline, where the screen's own note says what to do.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceOnPreloadError(storage('sessionStorage'), () => window.location.reload(), navigator.onLine !== false)) event.preventDefault()
})

const root = document.getElementById('root')
if (root === null) throw new Error('no #root element to mount into')

// A dashboard link's tokens leave the address before anything reads it.
takeTokensOutOfAddress()
restoreAddress(storage('localStorage'))
// Before the app draws, so Back finds the position of the page it left.
rememberScroll()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
