import { useState, useEffect, useRef } from 'react'
import { useRegistration } from '../hooks/useRegistration'
import { createNewRestaurantAPI } from '../apiServices'
import './Registration.css'

export function Registration({ firebaseUser, onRegistrationComplete }) {
  const registration = useRegistration(firebaseUser)
  const [showBackConfirm, setShowBackConfirm] = useState(false)

  const [isAddingNew, setIsAddingNew] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [foodType, setFoodType] = useState("")
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [placeName, setPlaceName] = useState("")

  const autocompleteContainerRef = useRef(null)
  const autocompleteElementRef = useRef(null)

  // ── 1. Load Google Maps script once on mount ──
  useEffect(() => {
    if (document.querySelector('script[src*="maps.googleapis"]')) return
    if (window.google) return

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_PLACES_API_KEY}&libraries=places&v=beta&loading=async`
    script.async = true
    document.head.appendChild(script)
  }, [])

  // ── 2. Attach PlaceAutocompleteElement when "Add New" form opens ──
  useEffect(() => {
    if (!isAddingNew) return

    const init = async () => {
      if (!autocompleteContainerRef.current || !window.google) return

      autocompleteContainerRef.current.innerHTML = ''

      const { PlaceAutocompleteElement, Place } = await window.google.maps.importLibrary('places')

      const placeAutocomplete = new PlaceAutocompleteElement({
        types: ['establishment'],
        includedRegionCodes: ['my'],
      })

      placeAutocomplete.style.width = '100%'
      autocompleteContainerRef.current.appendChild(placeAutocomplete)
      autocompleteElementRef.current = placeAutocomplete

      const handleSelect = async (event) => {
        try {
          const prediction = event.mh
          const placeId = prediction.placeId

          const place = new Place({ id: placeId })

          await place.fetchFields({
            fields: [
              'displayName',
              'formattedAddress',
              'location',
              'id',
              'websiteURI',
              'nationalPhoneNumber',
              'regularOpeningHours',
              'priceLevel',
            ]
          })

          const placeData = {
            place_id: place.id,
            name: place.displayName,
            formatted_address: place.formattedAddress,
            website: place.websiteURI ?? null,
            phone: place.nationalPhoneNumber ?? null,
            price_level: place.priceLevel ?? null,
            opening_hours: place.regularOpeningHours ?? null,
            geometry: {
              location: {
                lat: () => place.location.lat(),
                lng: () => place.location.lng(),
              }
            }
          }

          setSelectedPlace(placeData)
          setPlaceName(place.displayName)

        } catch (err) {
          console.error('error:', err)
        }
      }

      placeAutocomplete.addEventListener('gmp-select', handleSelect)
    }

    if (window.google) {
      init()
    } else {
      const script = document.querySelector('script[src*="maps.googleapis"]')
      script?.addEventListener('load', init)
      return () => script?.removeEventListener('load', init)
    }
  }, [isAddingNew])

  const handleCreateSubmit = async (e) => {
    e.preventDefault()

    if (!selectedPlace) {
      alert("Please select a restaurant from the Google suggestions dropdown")
      return
    }
    if (!foodType.trim()) {
      alert("Please enter the food type")
      return
    }

    setIsCreating(true)

    try {
      const formData = {
        name: selectedPlace.name,
        food_type: foodType,
        google_place_id: selectedPlace.place_id,
        google_formatted_address: selectedPlace.formatted_address,
        google_lat: selectedPlace.geometry.location.lat(),
        google_lng: selectedPlace.geometry.location.lng(),
        google_website: selectedPlace.website,
        google_phone: selectedPlace.phone,
        google_price_tier: selectedPlace.price_level,
        opening_hours: selectedPlace.opening_hours,
      }

      const result = await createNewRestaurantAPI(formData)

      if (result?.status === "exists") {
        alert("This restaurant already exists in our database.")
        window.location.href = "/"
        return
      }

      if (result?.store_id) {
        registration.selectRestaurant({ store_id: result.store_id, name: selectedPlace.name })
        setIsAddingNew(false)
      } else {
        alert("Failed to create restaurant. Please try again.")
      }
    } catch (err) {
      console.error("Error submitting new restaurant:", err)
      alert("An error occurred. Please try again.")
    } finally {
      setIsCreating(false)
    }
  }

  const handleBackClick = () => {
    if (isAddingNew) { setIsAddingNew(false); return }
    if (registration.step === 'role-confirmation') { registration.goBackToRoleSelection(); return }
    setShowBackConfirm(true)
  }
  const handleConfirmBack = () => { setShowBackConfirm(false); registration.goBackToRoleSelection() }
  const handleCancelBack = () => setShowBackConfirm(false)
  const handleRestaurantSearch = (e) => registration.searchRestaurants(e.target.value)
  const handleCompleteRegistration = async () => {
    const success = await registration.completeRegistration()
    if (success) onRegistrationComplete()
  }

  return (
    <div className="registration-container">
      <div className="registration-card">
        <h1 className="registration-title">🎯 Welcome to Review2Revenue</h1>
        <p className="registration-subtitle">Complete your profile to get started</p>

        {/* Confirmation Dialog */}
        {showBackConfirm && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex',
            justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          }}>
            <div style={{
              background: 'white', borderRadius: '12px', padding: '2rem',
              maxWidth: '400px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', textAlign: 'center',
            }}>
              <h3 style={{ marginBottom: '1rem', color: '#333' }}>Confirm Going Back</h3>
              <p style={{ marginBottom: '1.5rem', color: '#666', lineHeight: '1.6' }}>
                ⚠️ If you go back now, you'll be able to change your role.{' '}
                <strong>Once you confirm your role and complete registration, you will NOT be able to change it again.</strong>
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button
                  onClick={handleCancelBack}
                  style={{ padding: '10px 24px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}
                >
                  Stay
                </button>
                <button
                  onClick={handleConfirmBack}
                  style={{ padding: '10px 24px', background: '#FF6B6B', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}
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
              <button className="error-close" onClick={registration.clearError}>✕</button>
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
                background: 'rgba(255,200,100,0.15)', border: '2px solid rgba(255,150,100,0.3)',
                borderRadius: '12px', padding: '2rem', marginBottom: '2rem',
              }}>
                <p style={{ fontSize: '1.1rem', color: '#333', marginBottom: '1rem', lineHeight: '1.6' }}>
                  You are about to choose{' '}
                  <strong>{registration.role === 'diner' ? '🍴 Diner' : '🏪 Vendor'}</strong>
                </p>
                <p style={{ fontSize: '0.95rem', color: '#666', lineHeight: '1.6' }}>
                  ⚠️ <strong>Important:</strong> Once you confirm this role, you{' '}
                  <strong>CANNOT change it</strong> in the future. This decision is permanent.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={handleBackClick}
                  style={{ padding: '12px 32px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '1rem' }}
                >
                  ← Choose Different Role
                </button>
                <button
                  onClick={() => registration.confirmRole()}
                  disabled={registration.isLoading}
                  style={{
                    padding: '12px 32px',
                    background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
                    color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer',
                    fontWeight: '600', fontSize: '1rem', opacity: registration.isLoading ? 0.7 : 1,
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
              <h2>{isAddingNew ? 'Add New Restaurant' : 'Which restaurant do you manage?'}</h2>
              <button
                onClick={handleBackClick}
                disabled={registration.isLoading || isCreating}
                style={{
                  padding: '8px 16px', background: 'rgba(160,117,106,0.1)',
                  border: '1px solid rgba(160,117,106,0.3)', borderRadius: '6px',
                  color: '#A0756A', cursor: 'pointer', fontWeight: '500', fontSize: '0.9rem',
                }}
              >
                ← Back
              </button>
            </div>

            {isAddingNew ? (
              <form onSubmit={handleCreateSubmit} style={{ marginTop: '1rem' }}>
                <p className="step-description">
                  Search your restaurant on Google and select it from the dropdown.
                </p>

                <div style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem', color: '#555' }}>
                    Search Restaurant on Google
                  </label>

                  <div ref={autocompleteContainerRef} style={{ width: '100%' }} />

                  {selectedPlace && (
                    <p style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: '#2e7d32' }}>
                      ✅ {selectedPlace.formatted_address}
                    </p>
                  )}
                  {placeName.length >= 3 && !selectedPlace && (
                    <p style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: '#888' }}>
                      👆 Select a restaurant from the dropdown above
                    </p>
                  )}
                </div>

                <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem', color: '#555' }}>
                    Food Type <span style={{ fontWeight: 400, color: '#888' }}>(e.g. Italian, Café, Sushi)</span>
                  </label>
                  <input
                    required
                    className="search-input"
                    placeholder="Enter cuisine / food type…"
                    value={foodType}
                    onChange={(e) => setFoodType(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isCreating || !selectedPlace || !foodType.trim()}
                  className="continue-button"
                  style={{
                    width: '100%',
                    opacity: (isCreating || !selectedPlace || !foodType.trim()) ? 0.6 : 1,
                    cursor: (isCreating || !selectedPlace || !foodType.trim()) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isCreating ? '⏳ Processing…' : 'Save & Select Restaurant'}
                </button>
              </form>

            ) : (
              <>
                {!registration.matchedRestaurant && (
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>

                    {/* Search Existing */}
                    <div style={{
                      flex: 1, padding: '1.5rem', borderRadius: '12px', textAlign: 'center',
                      border: '2px solid rgba(255,150,100,0.4)', background: 'rgba(255,200,100,0.08)',
                    }}>
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
                      <p style={{ fontWeight: '600', color: '#333', marginBottom: '0.4rem' }}>Search Restaurant</p>
                      <p style={{ fontSize: '0.82rem', color: '#888', marginBottom: '1rem' }}>
                        Find your existing restaurant in our database
                      </p>
                      <input
                        type="text"
                        placeholder="Type restaurant name..."
                        value={registration.restaurantName}
                        onChange={handleRestaurantSearch}
                        disabled={registration.isLoading}
                        className="search-input"
                        style={{ width: '100%' }}
                      />
                      {registration.isSearching && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#888' }}>🔍 Searching...</div>
                      )}
                      {registration.restaurantSuggestions.length > 0 && (
                        <div className="suggestions-dropdown">
                          {registration.restaurantSuggestions.map((r) => (
                            <button key={r.store_id} className="suggestion-item" onClick={() => registration.selectRestaurant(r)}>
                              <span className="suggestion-name">{r.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {!registration.isSearching &&
                        registration.restaurantName.trim().length >= 2 &&
                        registration.restaurantSuggestions.length === 0 && (
                          <p style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#d32f2f' }}>
                            ❌ No results for "{registration.restaurantName}"
                          </p>
                        )}
                    </div>

                    {/* OR Divider */}
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', color: '#ccc', fontWeight: '600',
                      fontSize: '0.85rem', gap: '0.5rem', minWidth: '32px',
                    }}>
                      <div style={{ width: '1px', flex: 1, background: '#e0e0e0' }} />
                      <span style={{ color: '#bbb' }}>OR</span>
                      <div style={{ width: '1px', flex: 1, background: '#e0e0e0' }} />
                    </div>

                    {/* Add New */}
                    <div style={{
                      flex: 1, padding: '1.5rem', borderRadius: '12px', textAlign: 'center',
                      border: '2px dashed rgba(255,107,107,0.4)', background: 'rgba(255,107,107,0.05)',
                    }}>
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏪</div>
                      <p style={{ fontWeight: '600', color: '#333', marginBottom: '0.4rem' }}>Add New Restaurant</p>
                      <p style={{ fontSize: '0.82rem', color: '#888', marginBottom: '1rem' }}>
                        Your restaurant isn't listed? Register it here
                      </p>
                      <button
                        onClick={() => setIsAddingNew(true)}
                        style={{
                          padding: '10px 24px',
                          background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
                          color: 'white', border: 'none', borderRadius: '8px',
                          cursor: 'pointer', fontWeight: '600', fontSize: '0.95rem', width: '100%',
                        }}
                      >
                        + Add New Restaurant
                      </button>
                    </div>
                  </div>
                )}

                {/* Matched Restaurant Confirmation */}
                {registration.matchedRestaurant && (
                  <>
                    <div style={{
                      background: 'rgba(255,200,100,0.15)', border: '2px solid rgba(255,150,100,0.3)',
                      borderRadius: '12px', padding: '2rem', marginBottom: '2rem', textAlign: 'center',
                    }}>
                      <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>Your Restaurant:</p>
                      <p style={{ fontSize: '1.3rem', fontWeight: '600', color: '#333', marginBottom: '0.5rem' }}>
                        {registration.matchedRestaurant.name}
                      </p>
                      <button
                        onClick={() => registration.selectRestaurant(null)}
                        style={{ fontSize: '0.85rem', color: '#FF6B6B', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        ✕ Change restaurant
                      </button>
                    </div>
                    <button
                      className="continue-button"
                      onClick={handleCompleteRegistration}
                      disabled={registration.isLoading}
                    >
                      {registration.isLoading ? '⏳ Saving...' : '✓ Continue'}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 3: Complete - Diner */}
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
            <button className="continue-button" onClick={handleCompleteRegistration}>Enter App</button>
          </div>
        )}

        {/* Step 3: Complete - Vendor */}
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
            <button className="continue-button" onClick={handleCompleteRegistration}>Enter Dashboard</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Registration