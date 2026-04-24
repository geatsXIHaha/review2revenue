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
  
  const [showInsertReviewModal, setShowInsertReviewModal] = useState(false)
  const [csvFile, setCsvFile] = useState(null)
  const [isInsertingReview, setIsInsertingReview] = useState(false)
  const [insertReviewMessage, setInsertReviewMessage] = useState('')

  // Sync role with registeredRole whenever it changes
  useEffect(() => {
    setRole(registeredRole)
    // Also update prompt when role changes
    setPrompt(registeredRole === 'vendor' ? vendorExamples[0] : dinerExamples[0])
  }, [registeredRole])

  // Fetch vendor's restaurant info if they're a vendor
  useEffect(() => {
    if (registeredRole === 'vendor' && userProfile?.store_id) {
      async function fetchVendorRestaurant() {
        try {
          // Fetch the restaurant directly by store_id
          const response = await fetch(
            `${API_BASE}/api/restaurants/by-store-id?store_id=${userProfile.store_id}`,
          )
          if (response.ok) {
            const data = await response.json()
            const restaurant = data.restaurant
            setVendorRestaurant({
              store_id: restaurant.store_id,
              name: restaurant.name,
            })
            setRestaurantName(restaurant.name)
          } else {
            throw new Error('Restaurant not found')
          }
        } catch (err) {
          console.error('Error fetching vendor restaurant:', err)
          // Fallback: set placeholder
          const fallbackName = `Restaurant ${userProfile.store_id}`
          setVendorRestaurant({
            store_id: userProfile.store_id,
            name: fallbackName,
          })
          setRestaurantName(fallbackName)
        }
      }
      fetchVendorRestaurant()
    }
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
        if (!response.ok) {
          return
        }
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
    setIsLoading(true)
    setError('')
    setResponseMeta(null)

    if (role === 'vendor' && restaurantName.trim().length < 1) {
      setError('Vendor role requires restaurant name so analysis uses your restaurant data.')
      setIsLoading(false)
      return
    }

    let locationPayload = {}
    if (role === 'diner' && isNearestIntent(prompt)) {
      try {
        const loc = await getDeviceLocation()
        locationPayload = { user_lat: loc.lat, user_lng: loc.lng }
      } catch (locError) {
        setError(`Location is required for nearest queries. ${locError.message}`)
        setIsLoading(false)
        return
      }
    }

    const payload = {
      role,
      prompt,
      restaurant_name: restaurantName,
      // For vendors, include store_id so backend can fetch correct restaurant data
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
    } catch (submitError) {
      setError(submitError.message)
      setResult('')
      setResponseMeta(null)
    } finally {
      setIsLoading(false)
    }
  }

  function handleRoleChange(nextRole) {
    // Role is locked after registration - cannot be changed
    return
  }

  function parseCSV(text) {
    const lines = [];
    let currentLine = [];
    let currentCell = "";
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            currentCell += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentCell += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentLine.push(currentCell.trim());
          currentCell = "";
        } else if (char === '\n' || char === '\r') {
          if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
            i++;
          }
          currentLine.push(currentCell.trim());
          lines.push(currentLine);
          currentLine = [];
          currentCell = "";
        } else {
          currentCell += char;
        }
      }
    }
    if (currentCell || currentLine.length > 0) {
      currentLine.push(currentCell.trim());
      if (currentLine.length > 0 && currentLine.some(c => c)) {
        lines.push(currentLine);
      }
    }
    return lines.filter(l => l.length > 0 && l.some(c => c)); // filter empty lines
  }

  async function handleUploadCSV() {
    if (!userProfile?.store_id) {
      setInsertReviewMessage('Error: Store ID is missing.')
      return
    }
    if (!csvFile) {
      setInsertReviewMessage('Error: Please select a CSV file first.')
      return
    }
    
    setIsInsertingReview(true)
    setInsertReviewMessage('')
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const rows = parseCSV(text);
        if (rows.length < 2) {
           throw new Error('CSV file is empty or missing headers.');
        }
        
        // Assume first row is headers
        const headers = rows[0].map(h => h.toLowerCase());
        const textIdx = headers.findIndex(h => h.includes('text') || h.includes('review') || h.includes('content'));
        const ratingIdx = headers.findIndex(h => h.includes('overall_rating') || h.includes('rating'));
        const foodRatingIdx = headers.findIndex(h => h.includes('food_rating'));
        const riderRatingIdx = headers.findIndex(h => h.includes('rider_rating'));
        const updatedIdx = headers.findIndex(h => h.includes('updated_at') || h.includes('date') || h.includes('time'));
        
        if (textIdx === -1 || ratingIdx === -1 || foodRatingIdx === -1) {
           throw new Error('CSV must contain "review_text", "overall_rating", and "food_rating" columns.');
        }
        
        const validRows = [];
        const reviewsToPredict = [];
        
        for (let i = 1; i < rows.length; i++) {
           const row = rows[i];
           if (row.length <= Math.max(textIdx, ratingIdx, foodRatingIdx) || !row[textIdx]) continue;
           
           let overall_rating = parseFloat(row[ratingIdx]);
           if (isNaN(overall_rating)) overall_rating = 5;
           overall_rating = Math.max(1, Math.min(5, overall_rating));
           
           let food_rating = parseFloat(row[foodRatingIdx]);
           if (isNaN(food_rating)) food_rating = 5;
           food_rating = Math.max(1, Math.min(5, food_rating));
           
           let rider_rating = null;
           if (riderRatingIdx !== -1 && row[riderRatingIdx]) {
             const parsed = parseFloat(row[riderRatingIdx]);
             if (!isNaN(parsed)) {
               rider_rating = Math.max(1, Math.min(5, parsed));
             }
           }
           
           let updated_at = new Date().toISOString();
           if (updatedIdx !== -1 && row[updatedIdx]) {
             const parsedDate = new Date(row[updatedIdx]);
             if (!isNaN(parsedDate.getTime())) {
               updated_at = parsedDate.toISOString();
             }
           }
           
           const reviewText = row[textIdx];
           
           validRows.push({
             store_id: userProfile.store_id,
             review_text: reviewText,
             overall_rating: overall_rating,
             food_rating: food_rating,
             rider_rating: rider_rating,
             updated_at: updated_at
           });
           
           reviewsToPredict.push(reviewText);
        }
        
        if (validRows.length === 0) {
           throw new Error('No valid reviews found in the CSV.');
        }
        
        if (validRows.length > 500) {
           validRows.length = 500;
           reviewsToPredict.length = 500;
        }

        setInsertReviewMessage('Analyzing sentiment...');
        
        let predictedSentiments = [];
        try {
          const res = await fetch(`${API_BASE}/api/sentiment/predict-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviews: reviewsToPredict })
          });
          
          if (res.ok) {
            const data = await res.json();
            predictedSentiments = data.predictions || [];
          } else {
            console.warn('Batch sentiment prediction failed, falling back to unknown');
            predictedSentiments = new Array(reviewsToPredict.length).fill('unknown');
          }
        } catch (err) {
          console.warn('Network error during sentiment prediction', err);
          predictedSentiments = new Array(reviewsToPredict.length).fill('unknown');
        }
        
        const recordsToInsert = validRows.map((r, idx) => {
          const sent = predictedSentiments[idx] || 'unknown';
          return {
            ...r,
            sentiment: sent,
            sentiment_model: sent
          };
        });

        setInsertReviewMessage('Saving to database...');

        const { error } = await supabase
          .from('reviews')
          .insert(recordsToInsert)
          
        if (error) {
           if (error.message && error.message.includes('review_text')) {
             const fallbackRecords = recordsToInsert.map(r => {
                const { review_text, ...rest } = r;
                return { ...rest, text: review_text };
             });
             const { error: err2 } = await supabase.from('reviews').insert(fallbackRecords);
             if (err2) throw err2;
           } else {
             throw error;
           }
        }
        
        setInsertReviewMessage(`Success: ${recordsToInsert.length} reviews uploaded!`)
        setCsvFile(null)
        const fileInput = document.getElementById('csv-upload-input');
        if (fileInput) fileInput.value = '';
        
        const mappedForLocal = recordsToInsert.map(r => ({
           text: r.review_text || r.text,
           overall_rating: r.overall_rating,
           sentiment: r.sentiment,
           updated_at: r.updated_at
        }));
        
        setVendorReviews(prev => {
          const combined = [...mappedForLocal, ...prev];
          combined.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          return combined;
        });
        
      } catch (err) {
        setInsertReviewMessage(`Error: ${err.message}`)
      } finally {
        setIsInsertingReview(false)
      }
    };
    reader.onerror = () => {
      setInsertReviewMessage('Error: Failed to read file.');
      setIsInsertingReview(false);
    };
    reader.readAsText(csvFile);
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
              window.location.href = '/chat'
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
                <button type="submit" className="primary" disabled={isLoading}>
                  {isLoading ? 'Generating...' : 'Generate AI Answer'}
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

              <div className="actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                <button type="submit" className="primary" disabled={isLoading}>
                  {isLoading ? 'Generating...' : 'Generate AI Answer'}
                </button>
                <button
                  type="button"
                  className="primary secondary"
                  onClick={handleToggleVendorReviews}
                  disabled={isLoadingVendorReviews || !vendorRestaurant}
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
          {!error && result ? <ReactMarkdown>{result}</ReactMarkdown> : <p>Submit a prompt to see the result.</p>}
        </section>
      </section>
    </main>
  )
}

export default App
