import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { supabase } from './supabase'
import './App.css'

const API_BASE = 'http://localhost:8000'

function isNearestIntent(text) {
  const q = String(text || '').toLowerCase()
  return ['nearest', 'closest', 'near me', 'nearby', 'paling dekat', 'dekat sini'].some((k) => q.includes(k))
}

function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      (err) => {
        reject(new Error(err?.message || 'Unable to get location permission.'))
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  })
}

const dinerExamples = [
  'I want to eat nasi lemak',
  'I want a cheap restaurant near me',
  'I prefer fine dining with good service',
]

const vendorExamples = [
  'What should we improve based on recent reviews?',
  'What are our strongest points this month?',
  'Why is our rating lower than competitors?',
]

function App({ userProfile }) {
  const userId = userProfile?.id || ''
  const registeredRole = userProfile?.role || 'diner'
  const [role, setRole] = useState(registeredRole)
  const [prompt, setPrompt] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [restaurantOptions, setRestaurantOptions] = useState([])
  const [showRestaurantDropdown, setShowRestaurantDropdown] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [responseMeta, setResponseMeta] = useState(null)
  const [sentimentEngine, setSentimentEngine] = useState('unknown')
  const [vendorRestaurant, setVendorRestaurant] = useState(null)
  const [vendorReviews, setVendorReviews] = useState([])
  const [showVendorReviews, setShowVendorReviews] = useState(false)
  const [isLoadingVendorReviews, setIsLoadingVendorReviews] = useState(false)
  const [isStartingChat, setIsStartingChat] = useState(false)
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState('')
  const [isVendorRestaurantLoading, setIsVendorRestaurantLoading] = useState(false)
  const [showInsertReviewModal, setShowInsertReviewModal] = useState(false)
  const [isInsertingReview, setIsInsertingReview] = useState(false)
  const [insertReviewStatus, setInsertReviewStatus] = useState('')
  const [recommendedRestaurants, setRecommendedRestaurants] = useState([])

  function navigateTo(path) {
    if (window.location.pathname === path) return
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  // Missing states for the CSV Review upload
  const [csvFile, setCsvFile] = useState(null);
  const [insertReviewMessage, setInsertReviewMessage] = useState('');

  // Missing Menu Upload States
  const [menuFile, setMenuFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isLoadingUpload, setIsLoadingUpload] = useState(false);

  const handleUploadCSV = async () => {
    if (!csvFile || !userProfile?.store_id) {
      setInsertReviewMessage("Error: Please select a file and ensure you are logged in.");
      return;
    }

    setIsInsertingReview(true);
    setInsertReviewMessage("Uploading reviews...");

    const formData = new FormData();
    formData.append("file", csvFile);
    formData.append("store_id", userProfile.store_id);

    try {
     const response = await fetch(`${API_BASE}/api/reviews/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setInsertReviewMessage(`✅ Success: ${data.inserted_count} reviews added!`);
        setCsvFile(null);
        // Refresh the list so the new reviews show up
        handleToggleVendorReviews(); 
      } else {
        setInsertReviewMessage(`❌ Error: ${data.detail || "Failed to upload"}`);
      }
    } catch (err) {
      console.error("Upload error:", err);
      setInsertReviewMessage("❌ Error: Connection to backend failed.");
    } finally {
      setIsInsertingReview(false);
    }
  };
  // Sync role with registeredRole whenever it changes
  useEffect(() => {
    setRole(registeredRole)
    // Only seed an example prompt if the user has not typed anything yet.
    setPrompt((currentPrompt) => {
      if (currentPrompt.trim().length > 0) return currentPrompt
      return registeredRole === 'vendor' ? vendorExamples[0] : dinerExamples[0]
    })
  }, [registeredRole])

  // Fetch vendor's restaurant info
  useEffect(() => {
    if (registeredRole === 'vendor' && userProfile?.store_id) {
      let cancelled = false
      setIsVendorRestaurantLoading(true)
      async function fetchVendorRestaurant() {
        try {
          const response = await fetch(
            `${API_BASE}/api/restaurants/by-store-id?store_id=${userProfile.store_id}`,
          )
          if (response.ok) {
            const data = await response.json()
            const restaurant = data.restaurant
            if (!cancelled) {
              setVendorRestaurant({
                store_id: restaurant.store_id,
                name: restaurant.name,
              })
              setRestaurantName(restaurant.name)
            }
          } else {
            throw new Error('Restaurant not found')
          }
        } catch (err) {
          console.error('Error fetching vendor restaurant:', err)
          const fallbackName = `Restaurant ${userProfile.store_id}`
          if (!cancelled) {
            setVendorRestaurant({
              store_id: userProfile.store_id,
              name: fallbackName,
            })
            setRestaurantName(fallbackName)
          }
        } finally {
          if (!cancelled) {
            setIsVendorRestaurantLoading(false)
          }
        }
      }
      fetchVendorRestaurant()
      return () => {
        cancelled = true
      }
    }
    setIsVendorRestaurantLoading(false)
  }, [registeredRole, userProfile?.store_id])

  const roleExamples = role === 'diner' ? dinerExamples : vendorExamples

  // Fetch restaurant options for DINER only
  useEffect(() => {
    if (role !== 'diner') {
      setRestaurantOptions([])
      setShowRestaurantDropdown(false)
      return
    }

    const value = restaurantName.trim()
    if (value.length < 1) {
      setRestaurantOptions([])
      setShowRestaurantDropdown(false)
      return
    }

    const controller = new AbortController()

    async function fetchOptions() {
      try {
        const response = await fetch(
          `${API_BASE}/api/restaurants/search?query=${encodeURIComponent(value)}&limit=8`,
          { signal: controller.signal },
        )
        if (!response.ok) {
          return
        }
        const data = await response.json()
        const options = data.restaurants || []
        setRestaurantOptions(options)
        setShowRestaurantDropdown(options.length > 0)
      } catch (fetchError) {
        if (fetchError.name !== 'AbortError') {
          setRestaurantOptions([])
          setShowRestaurantDropdown(false)
        }
      }
    }

    fetchOptions()
    return () => controller.abort()
  }, [role, restaurantName])

  useEffect(() => {
    const controller = new AbortController()
    async function fetchSentimentEngine() {
      try {
        const response = await fetch(`${API_BASE}/api/sentiment/engine`, {
          signal: controller.signal,
        })
        if (!response.ok) return
        const data = await response.json()
        if (data.engine) {
          setSentimentEngine(data.engine)
        }
      } catch (fetchError) {
        if (fetchError.name !== 'AbortError') {
          setSentimentEngine('unknown')
        }
      }
    }
    fetchSentimentEngine()
    return () => controller.abort()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    const submittedPrompt = prompt
    setIsLoading(true)
    setError('')
    setResponseMeta(null)
    setRecommendedRestaurants([]) // Reset previous restaurants on new search

    if (!submittedPrompt.trim()) {
      setIsLoading(false)
      return
    }

    if (role === 'vendor' && !userId) {
      setError('Vendor profile is still loading. Please try again in a moment.')
      setIsLoading(false)
      return
    }

    if (role === 'vendor' && isVendorRestaurantLoading) {
      setError('Loading restaurant information. Please try again in a moment.')
      setIsLoading(false)
      return
    }

    if (role === 'vendor' && restaurantName.trim().length < 1) {
      setError('Vendor role requires restaurant name so analysis uses your restaurant data.')
      setIsLoading(false)
      return
    }

    let locationPayload = {}
    if (role === 'diner' && isNearestIntent(submittedPrompt)) {
      try {
        const loc = await getDeviceLocation()
        locationPayload = { user_lat: loc.lat, user_lng: loc.lng }
      } catch (locError) {
        setError(`Location is required for nearest queries. ${locError.message}`)
        setIsLoading(false)
        return
      }
    }

    setPrompt('')
    setLastSubmittedPrompt(submittedPrompt)

    const payload = {
      role,
      prompt: submittedPrompt,
      user_id: userId || undefined,
      persist: false,
      restaurant_name: restaurantName,
      ...(role === 'vendor' && userProfile?.store_id && { store_id: userProfile.store_id }),
      ...locationPayload,
    }

    try {
      const response = await fetch(`${API_BASE}/api/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Backend request failed. Please verify your Python API is running.')
      }

      const data = await response.json()
      setResult(data.answer || 'No answer returned by backend.')
      setResponseMeta({
        source: data.source || 'unknown',
        confidence: typeof data.confidence === 'number' ? data.confidence : null,
      })
      
      // --- ADDED THIS: Save the parsed restaurants to state ---
      if (data.restaurants && Array.isArray(data.restaurants)) {
        setRecommendedRestaurants(data.restaurants)
      }
      
    } catch (submitError) {
      setError(submitError.message)
      setResult('')
      setResponseMeta(null)
    } finally {
      setIsLoading(false)
    }
  }

  function handleGoToChat() {
    if (isStartingChat || !lastSubmittedPrompt.trim() || !result.trim() || !userId) {
      return
    }
    setIsStartingChat(true)
    try {
      const transitionPayload = {
        conversation_id:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `conv-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        user_id: userId,
        role,
        question: lastSubmittedPrompt,
        answer: result,
      }
      sessionStorage.setItem('pendingChatTransition', JSON.stringify(transitionPayload))
      navigateTo('/chat')
    } finally {
      setIsStartingChat(false)
    }
  }

  function handleRoleChange(nextRole) {
    // Role is locked after registration - cannot be changed
    return
  }

  async function handleToggleVendorReviews() {
    if (showVendorReviews) {
      setShowVendorReviews(false)
      return
    }
    if (showInsertReviewModal) {
      setShowInsertReviewModal(false)
    }
    if (!userProfile?.store_id) {
      setError('Unable to load reviews: store id is missing.')
      return
    }
    setError('')
    setIsLoadingVendorReviews(true)
    try {
      const response = await fetch(
        `${API_BASE}/api/reviews/by-store-id?store_id=${encodeURIComponent(userProfile.store_id)}&limit=100`,
      )
      if (!response.ok) {
        throw new Error('Failed to load reviews.')
      }
      const data = await response.json()
      const rows = Array.isArray(data.reviews) ? data.reviews : []
      setVendorReviews(rows)
      setShowVendorReviews(true)
    } catch (loadError) {
      setError(loadError.message || 'Failed to load reviews.')
    } finally {
      setIsLoadingVendorReviews(false)
    }
  }

  // --- MENU UPLOAD FUNCTIONS ---
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === "text/csv") {
      setMenuFile(file);
      setUploadStatus('');
    } else {
      setMenuFile(null);
      setUploadStatus('Error: Please select a valid .csv file');
    }
  };

  const handleInsertMenu = async () => {
    if (!menuFile) return;

    setIsLoadingUpload(true);
    setUploadStatus("Uploading and processing...");

    const formData = new FormData();
    formData.append("file", menuFile);
    // Uses the actual logged-in user's store_id!
    formData.append("store_id", userProfile?.store_id || "unknown"); 

    try {
      const response = await fetch(`${API_BASE}/api/menu/upload`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setUploadStatus(`✅ Success: ${result.inserted_count} items added!`);
        setMenuFile(null);
      } else {
        setUploadStatus(`❌ Error: ${result.detail || "Upload failed."}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus("❌ Network error. Is the backend running?");
    } finally {
      setIsLoadingUpload(false);
    }
  };

  const confidencePercent =
    responseMeta && typeof responseMeta.confidence === 'number'
      ? `${Math.round(responseMeta.confidence * 100)}%`
      : null

  const sentimentEngineLabel =
    sentimentEngine === 'trained_model'
      ? 'Trained Model'
      : sentimentEngine === 'keyword_fallback'
        ? 'Keyword Fallback'
        : 'Unknown'

  const sentimentEngineClass =
    sentimentEngine === 'trained_model'
      ? 'meta-pill meta-pill--trained'
      : sentimentEngine === 'keyword_fallback'
        ? 'meta-pill meta-pill--fallback'
        : 'meta-pill meta-pill--unknown'

  function renderRatingStars(value) {
    const raw = Number(value)
    if (!Number.isFinite(raw)) {
      return { stars: '☆☆☆☆☆', label: 'N/A' }
    }
    const clamped = Math.max(0, Math.min(5, raw))
    const rounded = Math.round(clamped)
    return {
      stars: `${'★'.repeat(rounded)}${'☆'.repeat(5 - rounded)}`,
      label: clamped.toFixed(1),
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <p className="eyebrow">Review2Revenue</p>
            <h1>AI Restaurant Decision System 🍜</h1>
          </div>
          <div style={{
            background: role === 'diner' ? 'rgba(100, 200, 150, 0.15)' : 'rgba(255, 150, 100, 0.15)',
            border: `2px solid ${role === 'diner' ? 'rgba(100, 200, 150, 0.3)' : 'rgba(255, 150, 100, 0.3)'}`,
            borderRadius: '8px',
            padding: '12px 20px',
            textAlign: 'center',
            minWidth: '150px',
          }}>
            <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 4px 0' }}>Your Role</p>
            <p style={{ fontSize: '1.1rem', fontWeight: '600', color: '#333', margin: '0' }}>
              {role === 'diner' ? '🍴 Diner' : '🏪 Vendor'}
            </p>
          </div>
        </div>
        <p className="subtext">
          React frontend with Python backend, PostgreSQL data, and Z.AI reasoning.
        </p>
        <div className="hero-actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              navigateTo('/chat')
            }}
          >
            Open Chat
          </button>
        </div>
      </header>

      <section className="panel">
        <form onSubmit={handleSubmit} className="form-grid">
          {/* DINER VIEW */}
          {role === 'diner' && (
            <>
              <label className="field">
                <span>Prompt</span>
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Ask your restaurant question..."
                  required
                />
              </label>

              <label className="field">
                <span>Restaurant Name (optional)</span>
                <div className="restaurant-search-wrap">
                  <input
                    type="text"
                    value={restaurantName}
                    onChange={(event) => setRestaurantName(event.target.value)}
                    onFocus={() => setShowRestaurantDropdown(restaurantOptions.length > 0)}
                    onBlur={() => setTimeout(() => setShowRestaurantDropdown(false), 120)}
                    placeholder="Example: Village Nasi Lemak"
                  />
                  {showRestaurantDropdown && restaurantOptions.length > 0 ? (
                    <ul className="restaurant-dropdown" role="listbox" aria-label="Restaurant suggestions">
                      {restaurantOptions.map((option) => (
                        <li key={option.store_id}>
                          <button
                            type="button"
                            className="restaurant-option"
                            onMouseDown={() => {
                              setRestaurantName(option.name)
                              setShowRestaurantDropdown(false)
                            }}
                          >
                            <span>{option.name}</span>
                            <small>{option.food_type}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <small className="field-hint">Type restaurant name to see matches from clean_restaurants data.</small>
              </label>

              <div className="actions">
                <button type="submit" className="primary" disabled={isLoading || !prompt.trim()}>
                  {isLoading ? 'Generating...' : 'Ask AI'}
                </button>
              </div>
            </>
          )}

          {/* VENDOR VIEW */}
          {role === 'vendor' && (
            <>
              <label className="field">
                <span>Your Restaurant</span>
                <div style={{
                  padding: '14px',
                  background: 'rgba(255, 200, 100, 0.15)',
                  border: '2px solid rgba(255, 150, 100, 0.3)',
                  borderRadius: '8px',
                  color: '#333',
                }}>
                  {vendorRestaurant ? (
                    <>
                      <p style={{ fontSize: '1.05rem', fontWeight: '600', margin: '0 0 6px 0' }}>
                        {vendorRestaurant.name}
                      </p>
                      <p style={{ fontSize: '0.85rem', color: '#666', margin: '0' }}>
                        Store ID: <strong>{vendorRestaurant.store_id}</strong>
                      </p>
                    </>
                  ) : (
                    <p style={{ fontSize: '0.95rem', color: '#d32f2f', fontWeight: '500', margin: '0' }}>
                      Loading restaurant information...
                    </p>
                  )}
                </div>
                <small className="field-hint">
                  {vendorRestaurant 
                    ? 'This is your registered restaurant. The system will analyze reviews and data for this restaurant.'
                    : 'Restaurant information is being loaded...'}
                </small>
              </label>

              <label className="field">
                <span>Prompt</span>
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Ask about your restaurant insights..."
                  required
                />
              </label>

              <div className="actions">
                <button
                  type="submit"
                  className="primary"
                  disabled={isLoading || isVendorRestaurantLoading || !userId || !prompt.trim()}
                >
                  {isLoading || isVendorRestaurantLoading ? 'Generating...' : 'Ask AI'}
                </button>
                <button
                  type="button"
                  className="primary secondary"
                  onClick={handleToggleVendorReviews}
                  disabled={isLoadingVendorReviews || isVendorRestaurantLoading || !vendorRestaurant}
                >
                  {isLoadingVendorReviews ? 'Loading...' : showVendorReviews ? 'Hide Reviews' : 'Reviews'}
                </button>
                <button
                  type="button"
                  className="primary secondary"
                  onClick={() => {
                    setShowInsertReviewModal(!showInsertReviewModal);
                    if (!showInsertReviewModal && showVendorReviews) {
                       setShowVendorReviews(false);
                    }
                  }}
                  disabled={!vendorRestaurant}
                >
                  {showInsertReviewModal ? 'Close Upload' : 'Insert Reviews'}
                </button>
              </div>

              {showInsertReviewModal && (
                <div style={{
                  marginTop: '15px',
                  padding: '20px',
                  background: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: '12px',
                  border: '1px solid rgba(100, 200, 150, 0.4)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                }}>
                  <h3 style={{ marginTop: 0, marginBottom: '5px', color: '#333' }}>Upload Reviews (CSV)</h3>
                  <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '15px' }}>
                    CSV must include <strong>"review_text"</strong>, <strong>"overall_rating"</strong>, and <strong>"food_rating"</strong> headers. <strong>"rider_rating"</strong> is optional. Max 500 reviews.
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{
                      padding: '15px', 
                      border: '2px dashed #ccc', 
                      borderRadius: '8px',
                      background: '#fafafa',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      <input 
                        id="csv-upload-input"
                        type="file" 
                        accept=".csv"
                        onChange={(e) => setCsvFile(e.target.files && e.target.files[0])}
                        disabled={isInsertingReview}
                        style={{ flex: 1 }}
                      />
                    </div>
                    
                    {insertReviewMessage && (
                      <p style={{ 
                        margin: 0, 
                        padding: '8px 12px', 
                        borderRadius: '6px',
                        background: insertReviewMessage.startsWith('Error') ? '#ffebee' : '#e8f5e9',
                        color: insertReviewMessage.startsWith('Error') ? '#c62828' : '#2e7d32',
                        fontWeight: '500'
                      }}>
                        {insertReviewMessage}
                      </p>
                    )}
                    
                    <div style={{ marginTop: '5px' }}>
                      <button 
                        type="button" 
                        className="primary"
                        onClick={handleUploadCSV}
                        disabled={isInsertingReview || !csvFile}
                        style={{ minWidth: '120px' }}
                      >
                        {isInsertingReview ? 'Uploading...' : 'Upload CSV'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showVendorReviews ? (
                <section className="vendor-reviews" aria-live="polite">
                  <h3>Latest Reviews (Newest First)</h3>
                  {vendorReviews.length === 0 ? (
                    <p>No reviews found for this restaurant.</p>
                  ) : (
                    <ul className="vendor-review-list">
                      {vendorReviews.map((review, index) => {
                        const rating = renderRatingStars(review.overall_rating)
                        return (
                          <li key={`${review.updated_at || 'unknown'}-${index}`} className="vendor-review-item">
                            <p>{review.text}</p>
                            <div className="vendor-review-rating" aria-label={`Rating ${rating.label} out of 5`}>
                              <span className="vendor-review-stars">{rating.stars}</span>
                              <span className="vendor-review-score">{rating.label}/5</span>
                            </div>
                            <small>
                              Sentiment: {review.sentiment || 'N/A'} | Date:{' '}
                              {review.updated_at ? new Date(review.updated_at).toLocaleString() : 'Unknown'}
                            </small>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              ) : null}
            </>
          )}
        </form>

        {/* --- MENU UPLOAD SECTION (Inside return, only for Vendors) --- */}
        {role === 'vendor' && (
          <div className="bg-white p-6 rounded-xl shadow-sm mb-6 max-w-2xl mx-auto border border-gray-100" style={{ marginTop: '2rem' }}>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Bulk Upload Menu</h3>
            <p className="text-sm text-gray-500 mb-4">
              Upload a CSV file with columns: menu_id, store_id, restaurant_name, item_name, category.
            </p>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileChange}
                style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '100%' }}
              />
              <button 
                type="button" 
                onClick={handleInsertMenu}
                disabled={!menuFile || isLoadingUpload}
                className="primary"
                style={{ opacity: (!menuFile || isLoadingUpload) ? 0.5 : 1 }}
              >
                {isLoadingUpload ? "Uploading..." : "Upload CSV"}
              </button>
            </div>
            
            {uploadStatus && (
              <div style={{
                marginTop: '1rem',
                padding: '12px',
                borderRadius: '6px',
                backgroundColor: uploadStatus.includes('❌') ? '#ffebee' : '#e8f5e9',
                color: uploadStatus.includes('❌') ? '#c62828' : '#2e7d32',
                fontSize: '0.9rem'
              }}>
                {uploadStatus}
              </div>
            )}
          </div>
        )}
        {/* --- END MENU UPLOAD SECTION --- */}

        <div className="example-block">
          <h2>Try one of these prompts</h2>
          <ul>
            {roleExamples.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  className="example"
                  onClick={() => setPrompt(example)}
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <section className="result" aria-live="polite">
          <h2>AI Output</h2>
          <div className="meta-row">
            <span className={sentimentEngineClass}>Sentiment Engine: {sentimentEngineLabel}</span>
            {confidencePercent ? <span className="meta-pill">Analysis Confidence: {confidencePercent}</span> : null}
            {responseMeta?.source ? <span className="meta-pill">Source: {responseMeta.source}</span> : null}
          </div>
          {error ? <p className="error">{error}</p> : null}
          {!error && result ? (
            <div className="ai-response-container">
              <div className="ai-message">
                <ReactMarkdown>{result}</ReactMarkdown>
              </div>
              <button
                type="button"
                className="primary secondary"
                onClick={handleGoToChat}
                disabled={isStartingChat || !userId || !lastSubmittedPrompt.trim() || !result.trim()}
              >
                {isStartingChat ? 'Preparing chat...' : 'Go to Chat'}
              </button>
            </div>
          ) : (
            <p>Submit a prompt to see the result.</p>
          )}
        </section>
      </section>
    </main>
  )
}

function RestaurantCard({ restaurant }) {
  const {
    name, food_type, avg_rating, address, phone, website,
    distance_km, operating_hours_today, price_description,
    sentiment_summary, lat, lng,
  } = restaurant

  const googleMapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=$${encodeURIComponent(address)}`
    : lat && lng ? `https://www.google.com/maps?q=$${lat},${lng}` : null

  const wazeUrl = lat && lng
    ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    : address ? `https://waze.com/ul?q=${encodeURIComponent(address)}` : null

  const stars = avg_rating
    ? '★'.repeat(Math.round(avg_rating)) + '☆'.repeat(5 - Math.round(avg_rating))
    : null
  const posRatio = sentiment_summary?.positive_ratio
  const sentimentColor = posRatio >= 0.7 ? '#22c55e' : posRatio >= 0.5 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{
      background: '#fff', border: '1.5px solid #f0e8e0', borderRadius: '14px',
      padding: '16px 18px', marginTop: '10px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: '700', color: '#1a1a1a' }}>{name}</h3>
          {food_type && (
            <span style={{
              fontSize: '0.72rem', background: '#fef3c7', color: '#92400e',
              borderRadius: '20px', padding: '2px 9px', fontWeight: '600',
            }}>{food_type}</span>
          )}
        </div>
        {avg_rating && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '0.82rem', color: '#f59e0b', letterSpacing: '1px' }}>{stars}</div>
            <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '2px' }}>{Number(avg_rating).toFixed(1)} / 5</div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
        {distance_km != null && (
          <span style={{
            background: '#eff6ff', color: '#1d4ed8', borderRadius: '20px',
            padding: '3px 9px', fontSize: '0.75rem', fontWeight: '600',
          }}>📍 {Number(distance_km).toFixed(1)} km away</span>
        )}
        {operating_hours_today && (
          <span style={{
            background: '#f0fdf4', color: '#166534', borderRadius: '20px',
            padding: '3px 9px', fontSize: '0.75rem', fontWeight: '500',
          }}>🕐 {operating_hours_today}</span>
        )}
        {price_description && price_description !== 'Unknown' && (
          <span style={{
            background: '#fdf4ff', color: '#7e22ce', borderRadius: '20px',
            padding: '3px 9px', fontSize: '0.75rem', fontWeight: '500',
          }}>💰 {price_description}</span>
        )}
        {posRatio != null && (
          <span style={{
            background: '#f9fafb', color: sentimentColor, borderRadius: '20px',
            padding: '3px 9px', fontSize: '0.75rem', fontWeight: '600',
            border: `1px solid ${sentimentColor}33`,
          }}>😊 {Math.round(posRatio * 100)}% positive</span>
        )}
      </div>

      {address && (
        <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#555', display: 'flex', gap: '5px' }}>
          <span>🏠</span><span>{address}</span>
        </p>
      )}

      {phone && (
        <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#555' }}>
          📞 <a href={`tel:${phone}`} style={{ color: '#d97706', fontWeight: '600', textDecoration: 'none' }}>{phone}</a>
        </p>
      )}

      {website && (
        <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem' }}>
          🌐 <a href={website} target="_blank" rel="noopener noreferrer"
            style={{ color: '#2563eb', fontWeight: '500', textDecoration: 'none', wordBreak: 'break-all' }}>
            {website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
          </a>
        </p>
      )}

      {(googleMapsUrl || wazeUrl) && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {googleMapsUrl && (
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              background: '#4285f4', color: '#fff', borderRadius: '8px',
              padding: '6px 12px', fontSize: '0.78rem', fontWeight: '600', textDecoration: 'none',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              Google Maps
            </a>
          )}
          {wazeUrl && (
            <a href={wazeUrl} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              background: '#05c8f7', color: '#fff', borderRadius: '8px',
              padding: '6px 12px', fontSize: '0.78rem', fontWeight: '600', textDecoration: 'none',
            }}>
              🚗 Waze
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export default App