import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { Login, logout } from './Login'
import App from './App'

export function ProtectedApp() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    try {
      console.log('ProtectedApp: Setting up auth listener...')
      
      // Listen for auth state changes
      const unsubscribe = onAuthStateChanged(
        auth,
        (currentUser) => {
          console.log('Auth state changed:', currentUser?.email)
          setUser(currentUser)
          setLoading(false)
        },
        (authError) => {
          console.error('Auth error:', authError)
          setError(authError?.message || 'Authentication error')
          setLoading(false)
        }
      )

      // Cleanup subscription
      return () => unsubscribe()
    } catch (err) {
      console.error('ProtectedApp error:', err)
      setError(err?.message || 'Unknown error')
      setLoading(false)
    }
  }, [])

  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '20px',
        textAlign: 'center',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 10
      }}>
        <h2 style={{ color: '#FF6B6B', fontSize: '2rem' }}>❌ Error Loading App</h2>
        <p style={{ color: '#FF6B6B', marginBottom: '20px', fontSize: '1.1rem' }}>{error}</p>
        <details style={{ textAlign: 'left', maxWidth: '500px' }}>
          <summary style={{ cursor: 'pointer', color: '#A0756A', fontWeight: '600', marginBottom: '10px' }}>Debug Info</summary>
          <pre style={{ background: 'rgba(255, 214, 165, 0.3)', padding: '10px', borderRadius: '4px', overflow: 'auto', border: '1px solid rgba(255, 150, 100, 0.4)', color: '#A0756A' }}>
            {error}
          </pre>
        </details>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontSize: '18px',
        color: '#A0756A',
        position: 'relative',
        zIndex: 10
      }}>
        🍜 Loading application...
      </div>
    )
  }

  // If user is not logged in, show login screen
  if (!user) {
    return <Login onLoginSuccess={setUser} />
  }

  // User is logged in, show the main app
  return (
    <div>
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        padding: '16px 20px',
        background: 'rgba(255, 255, 255, 0.55)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: '2px solid rgba(255, 255, 255, 0.8)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        fontSize: 'clamp(0.85rem, 2vw, 0.95rem)',
        borderRadius: '0 0 0 20px',
        flexWrap: 'wrap',
        maxWidth: '90vw'
      }}>
        <span style={{ color: '#A0756A', fontWeight: '700', whiteSpace: 'nowrap' }}>
          👋 Welcome, {(user.displayName || user.email || '').substring(0, 20)}
        </span>
        <button
          onClick={logout}
          style={{
            padding: '10px 18px',
            background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '50px',
            cursor: 'pointer',
            fontSize: 'clamp(0.85rem, 2vw, 0.95rem)',
            fontWeight: '700',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 12px rgba(255, 107, 107, 0.25)',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = 'translateY(-2px)'
            e.target.style.boxShadow = '0 6px 20px rgba(255, 107, 107, 0.35)'
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)'
            e.target.style.boxShadow = '0 4px 12px rgba(255, 107, 107, 0.25)'
          }}
        >
          🚪 Sign Out
        </button>
      </div>
      <App />
    </div>
  )
}
