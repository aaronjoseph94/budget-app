import { StrictMode, Suspense } from 'react'
import { lazyPart } from './lib/lazy-part.js'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.js'
import { restoreAddress } from './nav.js'
import { isConsentPath } from './ai-apps/consent-path.js'
import { takeTokensOutOfAddress } from './auth.js'
import { reloadOnceOnPreloadError } from './shell/preload-reload.js'

// The page Supabase sends an AI app's sign-in to (PLAN §2.10): a real
// path, since the app's own screens live in the hash. Its own chunk, so
// the first load stays as it was.
const ConsentScreen = lazyPart(() => import('./ai-apps/ConsentScreen.js').then((m) => ({ default: m.ConsentScreen })))

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
const consent = isConsentPath(window.location.pathname)
// Not on the consent page, so a remembered screen can never replace it.
if (!consent) restoreAddress(storage('localStorage'))

createRoot(root).render(
  <StrictMode>
    {consent ? (
      <Suspense fallback={null}>
        <ConsentScreen />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
