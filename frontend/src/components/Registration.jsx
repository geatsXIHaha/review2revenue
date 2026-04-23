import { useState, useEffect } from 'react'
import { useRegistration } from '../hooks/useRegistration'
import './Registration.css'

/**
 * Registration Component
 *
 * Manages the complete registration/onboarding flow:
 * 1. Role Selection: User chooses 'diner' or 'vendor'
 * 2. Vendor Restaurant Matching: Vendors search and select their restaurant
 * 3. Profile Completion: Save profile to Supabase
 *
 * Props:
 * - firebaseUser: The authenticated Firebase user object
 * - onRegistrationComplete: Callback fired when registration finishes
 */
export function Registration({ firebaseUser, onRegistrationComplete }) {
  const registration = useRegistration(firebaseUser)
  const [searchTimeout, setSearchTimeout] = useState(null)
  const [showBackConfirm, setShowBackConfirm] = useState(false)

  // Handle back button with confirmation
  const handleBackClick = () => {
    // If on confirmation step, go back directly without dialog
    if (registration.step === 'role-confirmation') {
      registration.goBackToRoleSelection()
      return
    }
    // Otherwise show confirmation dialog
    setShowBackConfirm(true)
  }

  const handleConfirmBack = () => {
    setShowBackConfirm(false)
    registration.goBackToRoleSelection()
  }

  const handleCancelBack = () => {
    setShowBackConfirm(false)
  }

  // Handle restaurant search with debouncing
  const handleRestaurantSearch = (e) => {
    const value = e.target.value
    
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout)
    }

    if (value.trim().length === 0) {
      registration.searchRestaurants('')
      setSearchTimeout(null)
      return
    }

    // Set new timeout for debounced search (increased from 300ms to 500ms for better performance)
    const timeout = setTimeout(() => {
      registration.searchRestaurants(value)
      setSearchTimeout(null)
    }, 500)

    setSearchTimeout(timeout)
  }

  // Handle final registration submission
  const handleCompleteRegistration = async () => {
    const success = await registration.completeRegistration()
    if (success) {
      onRegistrationComplete()
    }
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => clearTimeout(searchTimeout)
  }, [searchTimeout])

  return (
    <div className="registration-container">
      <div className="registration-card">
        <h1 className="registration-title">🎯 Welcome to Review2Revenue</h1>
        <p className="registration-subtitle">Complete your profile to get started</p>

        {/* Confirmation Dialog */}
        {showBackConfirm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}>
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '400px',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
              textAlign: 'center',
            }}>
              <h3 style={{ marginBottom: '1rem', color: '#333' }}>Confirm Going Back</h3>
              <p style={{ marginBottom: '1.5rem', color: '#666', lineHeight: '1.6' }}>
                ⚠️ If you go back now, you'll be able to change your role. <strong>However, once you confirm your role and complete registration, you will NOT be able to change it again.</strong>
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button
                  onClick={handleCancelBack}
                  style={{
                    padding: '10px 24px',
                    background: '#f0f0f0',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#e0e0e0'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = '#f0f0f0'
                  }}
                >
                  Stay
                </button>
                <button
                  onClick={handleConfirmBack}
                  style={{
                    padding: '10px 24px',
                    background: '#FF6B6B',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#FF5252'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = '#FF6B6B'
                  }}
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {registration.error && (
          <div className="error-banner">
            <span className="error-icon">⚠️</span>
            <div className="error-content">
              <p className="error-message">{registration.error}</p>
              <button className="error-close" onClick={registration.clearError}>
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Role Selection */}
        {registration.step === 'role-selection' && (
          <div className="registration-step">
            <h2>What's your role?</h2>
            <p className="step-description">Choose how you'll use Review2Revenue</p>

            <div className="role-selection">
              <button
                className={`role-button ${registration.role === 'diner' ? 'selected' : ''}`}
                onClick={() => registration.selectRole('diner')}
                disabled={registration.isLoading}
              >
                <span className="role-icon">🍴</span>
                <span className="role-name">Diner</span>
                <span className="role-description">Discover restaurants based on reviews</span>
              </button>

              <button
                className={`role-button ${registration.role === 'vendor' ? 'selected' : ''}`}
                onClick={() => registration.selectRole('vendor')}
                disabled={registration.isLoading}
              >
                <span className="role-icon">🏪</span>
                <span className="role-name">Vendor</span>
                <span className="role-description">Manage your restaurant insights</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 1.5: Role Confirmation */}
        {registration.step === 'role-confirmation' && (
          <div className="registration-step">
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ marginBottom: '1rem' }}>Confirm Your Role</h2>
              <div style={{
                background: 'rgba(255, 200, 100, 0.15)',
                border: '2px solid rgba(255, 150, 100, 0.3)',
                borderRadius: '12px',
                padding: '2rem',
                marginBottom: '2rem',
              }}>
                <p style={{ fontSize: '1.1rem', color: '#333', marginBottom: '1rem', lineHeight: '1.6' }}>
                  You are about to choose <strong>{registration.role === 'diner' ? '🍴 Diner' : '🏪 Vendor'}</strong>
                </p>
                <p style={{ fontSize: '0.95rem', color: '#666', marginBottom: '1rem', lineHeight: '1.6' }}>
                  ⚠️ <strong>Important:</strong> Once you confirm this role, you <strong>CANNOT change it</strong> in the future. This decision is permanent.
                </p>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={handleBackClick}
                  style={{
                    padding: '12px 32px',
                    background: '#f0f0f0',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '1rem',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#e0e0e0'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = '#f0f0f0'
                  }}
                >
                  ← Choose Different Role
                </button>
                <button
                  onClick={() => registration.confirmRole()}
                  disabled={registration.isLoading}
                  style={{
                    padding: '12px 32px',
                    background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '1rem',
                    transition: 'all 0.2s',
                    opacity: registration.isLoading ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!registration.isLoading) {
                      e.target.style.transform = 'translateY(-2px)'
                      e.target.style.boxShadow = '0 6px 20px rgba(255, 107, 107, 0.35)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)'
                    e.target.style.boxShadow = '0 4px 12px rgba(255, 107, 107, 0.25)'
                  }}
                >
                  ✓ Confirm {registration.role === 'diner' ? 'Diner' : 'Vendor'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Vendor Restaurant Selection */}
        {registration.step === 'vendor-matching' && (
          <div className="registration-step">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2>Which restaurant do you manage?</h2>
              <button
                className="back-button"
                onClick={handleBackClick}
                disabled={registration.isLoading}
                title="Go back to role selection"
                style={{
                  padding: '8px 16px',
                  background: 'rgba(160, 117, 106, 0.1)',
                  border: '1px solid rgba(160, 117, 106, 0.3)',
                  borderRadius: '6px',
                  color: '#A0756A',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(160, 117, 106, 0.2)'
                  e.target.style.borderColor = 'rgba(160, 117, 106, 0.5)'
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(160, 117, 106, 0.1)'
                  e.target.style.borderColor = 'rgba(160, 117, 106, 0.3)'
                }}
              >
                ← Back
              </button>
            </div>
            <p className="step-description">Confirm your restaurant</p>

            {registration.matchedRestaurant ? (
              <div style={{
                background: 'rgba(255, 200, 100, 0.15)',
                border: '2px solid rgba(255, 150, 100, 0.3)',
                borderRadius: '12px',
                padding: '2rem',
                marginTop: '2rem',
                marginBottom: '2rem',
                textAlign: 'center',
              }}>
                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>Your Restaurant:</p>
                <p style={{ fontSize: '1.3rem', fontWeight: '600', color: '#333', marginBottom: '0' }}>
                  {registration.matchedRestaurant.name}
                </p>
              </div>
            ) : (
              <div style={{
                background: 'rgba(255, 100, 100, 0.15)',
                border: '2px solid rgba(255, 100, 100, 0.3)',
                borderRadius: '12px',
                padding: '2rem',
                marginTop: '2rem',
                marginBottom: '2rem',
                textAlign: 'center',
              }}>
                <p style={{ fontSize: '0.95rem', color: '#d32f2f', fontWeight: '500' }}>
                  ⚠️ Please search and select your restaurant to continue
                </p>
                <div className="restaurant-search" style={{ marginTop: '1rem' }}>
                  <input
                    type="text"
                    placeholder="Type restaurant name... (min 2 characters)"
                    value={registration.restaurantName}
                    onChange={handleRestaurantSearch}
                    disabled={registration.isLoading}
                    className="search-input"
                    autoFocus
                  />
                  {registration.isLoading && <div className="search-spinner">🔍</div>}
                </div>

                {/* Restaurant Suggestions Dropdown */}
                {registration.restaurantSuggestions.length > 0 && (
                  <div className="suggestions-dropdown">
                    {registration.restaurantSuggestions.map((restaurant) => (
                      <button
                        key={restaurant.store_id}
                        className="suggestion-item"
                        onClick={() => registration.selectRestaurant(restaurant)}
                      >
                        <span className="suggestion-name">{restaurant.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* No Results Message */}
                {!registration.isLoading &&
                  registration.restaurantName.trim().length >= 2 &&
                  registration.restaurantSuggestions.length === 0 && (
                    <div className="no-results">
                      <p>❌ No restaurants found matching "{registration.restaurantName}"</p>
                      <p className="no-results-hint">
                        If your restaurant isn't in the system yet, please contact support.
                      </p>
                    </div>
                  )}
              </div>
            )}

            {/* Continue Button */}
            {registration.matchedRestaurant && (
              <button
                className="continue-button"
                onClick={handleCompleteRegistration}
                disabled={registration.isLoading}
              >
                {registration.isLoading ? '⏳ Saving...' : '✓ Continue'}
              </button>
            )}
          </div>
        )}

        {/* Step 3: Registration Complete */}
        {registration.step === 'complete' && registration.role === 'diner' && (
          <div className="registration-step">
            <div className="complete-message">
              <span className="complete-icon">✓</span>
              <h2>Profile Created!</h2>
              <p>Welcome aboard, {firebaseUser.displayName || firebaseUser.email}!</p>
              <p className="complete-subtitle">
                You're all set as a <strong>Diner</strong>. Discover amazing restaurants now!
              </p>
            </div>
            <button className="continue-button" onClick={handleCompleteRegistration}>
              Enter App
            </button>
          </div>
        )}

        {registration.step === 'complete' && registration.role === 'vendor' && (
          <div className="registration-step">
            <div className="complete-message">
              <span className="complete-icon">✓</span>
              <h2>Vendor Profile Created!</h2>
              <p>Welcome, {firebaseUser.displayName || firebaseUser.email}!</p>
              <p className="complete-subtitle">
                Managing: <strong>{registration.matchedRestaurant?.name}</strong>
              </p>
              <p>Access your restaurant insights and analytics.</p>
            </div>
            <button className="continue-button" onClick={handleCompleteRegistration}>
              Enter Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Registration
