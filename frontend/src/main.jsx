import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ProtectedApp } from './ProtectedApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ProtectedApp />
  </StrictMode>,
)
