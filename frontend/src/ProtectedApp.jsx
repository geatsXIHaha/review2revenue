import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { supabase } from './supabase'
import { Login, logout } from './Login'
import Registration from './components/Registration'
import App from './App'

export function ProtectedApp() {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null) // Supabase user profile
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [registrationNeeded, setRegistrationNeeded] = useState(false)

  useEffect(() => {
    try {
      console.log('ProtectedApp: Setting up auth listener...')

      // Listen for auth state changes
      const unsubscribe = onAuthStateChanged(
        auth,
        async (currentUser) => {
          console.log('Auth state changed:', currentUser?.email)
          setUser(currentUser)

          if (currentUser) {
            // Check if user profile exists in Supabase
            try {
              const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', currentUser.uid)
                .single()

              if (error && error.code === 'PGRST116') {
                // User not found in Supabase - registration needed
                console.log('User not found in Supabase, registration needed')
                setRegistrationNeeded(true)
                setUserProfile(null)
              } else if (error) {
                throw error
              } else {
                // User profile exists
                console.log('User profile found:', data)
                setUserProfile(data)
                setRegistrationNeeded(false)
              }
            } catch (dbError) {
              console.error('Error checking user profile:', dbError)
              // If there's an error querying the DB but user is authed, still show registration
              setRegistrationNeeded(true)
            }
          } else {
            // User logged out
            setUserProfile(null)
            setRegistrationNeeded(false)
          }

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

  // If user is logged in but registration is needed, show registration flow
  if (registrationNeeded) {
    return (
      <Registration
        firebaseUser={user}
        onRegistrationComplete={async () => {
          try {
            // Refresh user profile from Supabase immediately after registration
            const { data } = await supabase
              .from('users')
              .select('*')
              .eq('id', user.uid)
              .single()
            setUserProfile(data)
            setRegistrationNeeded(false)
          } catch (err) {
            console.error('Failed to refresh user profile after registration:', err)
            setRegistrationNeeded(false)
          }
        }}
      />
    )
  }

  // User is fully registered, show the main app
  return (
    <div>
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        padding: '16px 20px',
        background: 'rgba(255, 255, 255, 0.92)',
        border: '2px solid rgba(255, 200, 150, 0.3)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
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
      <App userProfile={userProfile} />
    </div>
  )
}
