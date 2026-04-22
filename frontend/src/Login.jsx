import { useState } from 'react'
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth'
import { auth } from './firebase'
import './Login.css'

export function Login({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError('')
    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      console.log('User signed in:', result.user)
      onLoginSuccess(result.user)
    } catch (error) {
      console.error('Sign in error:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Review2Revenue</h1>
        <p className="login-subtitle">Sign in to get started</p>
        
        {error && <div className="error-message">{error}</div>}
        
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="google-signin-btn"
        >
          {loading ? 'Signing in...' : '🔐 Sign in with Google'}
        </button>
        
        <p className="login-info">
          Sign in with your Google account to access your restaurant insights
        </p>
      </div>
    </div>
  )
}

export async function logout() {
  try {
    await signOut(auth)
    console.log('User signed out')
  } catch (error) {
    console.error('Sign out error:', error)
  }
}
