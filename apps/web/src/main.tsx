import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.js'
import { restoreAddress } from './nav.js'
import { reloadOnceOnPreloadError } from './shell/preload-reload.js'

// Reading localStorage can itself throw (storage blocked), so ask carefully.
function deviceStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

// A screen's chunk from an older deploy: reload once for the new one (FE-1).
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceOnPreloadError(sessionStore(), () => window.location.reload())) event.preventDefault()
})

const root = document.getElementById('root')
if (root === null) throw new Error('no #root element to mount into')

restoreAddress(deviceStorage())

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
