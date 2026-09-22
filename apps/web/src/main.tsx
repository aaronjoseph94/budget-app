import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.js'

const root = document.getElementById('root')
if (root === null) throw new Error('no #root element to mount into')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
