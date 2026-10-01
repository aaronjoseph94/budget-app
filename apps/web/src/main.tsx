import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.js'
import { restoreAddress } from './nav.js'
import { isConsentPath } from './ai-apps/consent-path.js'

// The page Supabase sends an AI app's sign-in to (PLAN §2.10): a real
// path, since the app's own screens live in the hash. Its own chunk, so
// the first load stays as it was.
const ConsentScreen = lazy(() => import('./ai-apps/ConsentScreen.js').then((m) => ({ default: m.ConsentScreen })))

// Reading localStorage can itself throw (storage blocked), so ask carefully.
function deviceStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const root = document.getElementById('root')
if (root === null) throw new Error('no #root element to mount into')

const consent = isConsentPath(window.location.pathname)
// Not on the consent page, so a remembered screen can never replace it.
if (!consent) restoreAddress(deviceStorage())

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
