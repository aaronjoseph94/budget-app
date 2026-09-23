import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.js'
import { restoreAddress } from './nav.js'

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

restoreAddress(deviceStorage())

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
