import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ChatPage from './ChatPage.jsx'

function Root() {
  const path = window.location.pathname
  if (path === '/chat') {
    return <ChatPage />
  }
  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
