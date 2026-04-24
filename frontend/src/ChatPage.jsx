import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './ChatPage.css'
import { useGeolocation } from './hooks/useGeolocation';

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
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (err) => reject(new Error(err?.message || 'Unable to get location permission.')),
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

function createConversationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `conv-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function shortPreview(text) {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= 40) return clean || 'Untitled chat'
  return `${clean.slice(0, 40)}...`
}

// ── Restaurant Card ────────────────────────────────────────────────────────────
function RestaurantCard({ restaurant }) {
  const {
    name, food_type, avg_rating, address, phone, website,
    distance_km, operating_hours_today, price_description,
    sentiment_summary, lat, lng,
  } = restaurant

  const googleMapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null

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

// ── Main ChatPage ──────────────────────────────────────────────────────────────
function ChatPage() {
  const [role, setRole] = useState('diner')
  const [prompt, setPrompt] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [externalReviewsText, setExternalReviewsText] = useState('')
  const [restaurantOptions, setRestaurantOptions] = useState([])
  const [showRestaurantDropdown, setShowRestaurantDropdown] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [conversationId, setConversationId] = useState('')
  const [conversations, setConversations] = useState([])
  const [error, setError] = useState('')

  const { coords, cityName, error: locError, getLocation } = useGeolocation();
  const roleExamples = role === 'diner' ? dinerExamples : vendorExamples

  async function fetchConversations(roleValue) {
    try {
      const response = await fetch(`${API_BASE}/api/chat/conversations?role=${encodeURIComponent(roleValue)}&limit=100`)
      if (!response.ok) return []
      return await response.json()
    } catch { return [] }
  }

  async function fetchHistory(roleValue, convId) {
    if (!convId) { setChatMessages([]); return }
    try {
      const response = await fetch(
        `${API_BASE}/api/chat/history?conversation_id=${encodeURIComponent(convId)}&role=${encodeURIComponent(roleValue)}`,
      )
      if (!response.ok) { setChatMessages([]); return }
      const data = await response.json()
      const messages = (data.messages || []).map((m, index) => ({
        id: `${convId}-${index}`,
        sender: m.sender || 'assistant',
        message: m.message || '',
        restaurants: [],
      }))
      setChatMessages(messages)
    } catch { setChatMessages([]) }
  }

  useEffect(() => {
    async function initRoleChats() {
      const rows = await fetchConversations(role)
      setConversations(rows)
      if (rows.length > 0) setConversationId(rows[0].conversation_id)
      else setConversationId(createConversationId())
    }
    initRoleChats()
  }, [role])

  useEffect(() => { fetchHistory(role, conversationId) }, [role, conversationId])

  useEffect(() => {
    if (role !== 'vendor') { setRestaurantOptions([]); setShowRestaurantDropdown(false); return }
    const value = restaurantName.trim()
    if (value.length < 1) { setRestaurantOptions([]); setShowRestaurantDropdown(false); return }
    const controller = new AbortController()
    async function fetchOptions() {
      try {
        const response = await fetch(
          `${API_BASE}/api/restaurants/search?query=${encodeURIComponent(value)}&limit=8`,
          { signal: controller.signal },
        )
        if (!response.ok) return
        const data = await response.json()
        const options = data.restaurants || []
        setRestaurantOptions(options)
        setShowRestaurantDropdown(options.length > 0)
      } catch { setRestaurantOptions([]); setShowRestaurantDropdown(false) }
    }
    fetchOptions()
    return () => controller.abort()
  }, [role, restaurantName])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!prompt.trim()) return
    setError('')

    if (role === 'vendor' && restaurantName.trim().length < 1) {
      setError('Vendor role requires restaurant name.')
      return
    }

    const activeConversationId = conversationId || createConversationId()
    if (!conversationId) setConversationId(activeConversationId)

    const externalReviews = externalReviewsText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    const userMessage = { id: `u-${Date.now()}`, sender: 'user', message: prompt, restaurants: [] }
    setChatMessages((prev) => [...prev, userMessage])
    setIsLoading(true)

    let locationPayload = {}
    if (role === 'diner' && coords) {
      locationPayload = { user_lat: coords.lat, user_lng: coords.lng, city_name: cityName }
    } else if (role === 'diner' && isNearestIntent(prompt)) {
      try {
        const loc = await getDeviceLocation()
        locationPayload = { user_lat: loc.lat, user_lng: loc.lng }
      } catch (locErr) {
        setError(`Location is required for nearest queries. ${locErr.message}`)
        setChatMessages((prev) => prev.slice(0, Math.max(prev.length - 1, 0)))
        setIsLoading(false)
        return
      }
    }

    const payload = {
      role, prompt,
      conversation_id: activeConversationId,
      restaurant_name: restaurantName,
      external_reviews: role === 'vendor' && externalReviews.length > 0 ? externalReviews : undefined,
      ...locationPayload,
    }

    try {
      const response = await fetch(`${API_BASE}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Backend request failed.')

      const data = await response.json()

      // Show ALL backend restaurant cards — no filtering needed
      // System prompt ensures AI only mentions restaurants from context_items
      const assistantMessage = {
        id: `a-${Date.now()}`,
        sender: 'assistant',
        message: data.answer || 'No answer returned by backend.',
        restaurants: Array.isArray(data.restaurants) ? data.restaurants : [],
      }

      setChatMessages((prev) => [...prev, assistantMessage])
      setPrompt('')

      const rows = await fetchConversations(role)
      setConversations(rows)
      if (data.conversation_id) setConversationId(data.conversation_id)
    } catch (submitError) {
      setError(submitError.message)
      setChatMessages((prev) => prev.slice(0, Math.max(prev.length - 1, 0)))
    } finally {
      setIsLoading(false)
    }
  }

  function handleNewChat() {
    setConversationId(createConversationId())
    setChatMessages([])
    setPrompt('')
    setError('')
  }

  const activeConversationLabel = useMemo(() => {
    const found = conversations.find((c) => c.conversation_id === conversationId)
    return found ? shortPreview(found.last_message) : 'New chat'
  }, [conversations, conversationId])

  return (
    <main className="chat-page">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-header">
          <button type="button" className="chat-btn chat-btn--primary" onClick={handleNewChat}>+ New Chat</button>
          <button type="button" className="chat-btn" onClick={() => { window.location.href = '/' }}>Back</button>
        </div>

        <div className="chat-role-switch">
          <button type="button" className={role === 'diner' ? 'chat-role active' : 'chat-role'} onClick={() => setRole('diner')}>User</button>
          <button type="button" className={role === 'vendor' ? 'chat-role active' : 'chat-role'} onClick={() => setRole('vendor')}>Vendor</button>
        </div>

        <ul className="conversation-list">
          {conversations.map((conversation) => (
            <li key={conversation.conversation_id}>
              <button
                type="button"
                className={conversationId === conversation.conversation_id ? 'conversation-item active' : 'conversation-item'}
                onClick={() => setConversationId(conversation.conversation_id)}
              >
                <span>{shortPreview(conversation.last_message)}</span>
                <small>{new Date(conversation.updated_at).toLocaleString()}</small>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="chat-main">
        <header className="chat-main-header">
          <h1>{activeConversationLabel}</h1>
          <p>{role === 'vendor' ? 'Vendor assistant' : 'Food recommendation assistant'}</p>
        </header>

        {role === 'vendor' && (
          <div className="vendor-inline">
            <label>
              Vendor Name
              <div className="restaurant-search-wrap">
                <input
                  type="text" value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  onFocus={() => setShowRestaurantDropdown(restaurantOptions.length > 0)}
                  onBlur={() => setTimeout(() => setShowRestaurantDropdown(false), 120)}
                  placeholder="Type your restaurant name"
                />
                {showRestaurantDropdown && restaurantOptions.length > 0 && (
                  <ul className="restaurant-dropdown" role="listbox">
                    {restaurantOptions.map((option) => (
                      <li key={option.store_id}>
                        <button type="button" className="restaurant-option"
                          onMouseDown={() => { setRestaurantName(option.name); setShowRestaurantDropdown(false) }}>
                          <span>{option.name}</span>
                          <small>{option.food_type}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </label>
          </div>
        )}

        {error && <p className="chat-error">{error}</p>}

        <div className="chat-thread">
          {chatMessages.length === 0 && (
            <div className="chat-empty">
              <p>Start chatting. The AI will remember your previous turns in this conversation.</p>
              <div className="quick-prompts">
                {roleExamples.map((example) => (
                  <button key={example} type="button" onClick={() => setPrompt(example)}>{example}</button>
                ))}
              </div>
            </div>
          )}

          {chatMessages.map((msg) => (
            <article
              key={msg.id}
              className={msg.sender === 'user' ? 'thread-message thread-message--user' : 'thread-message thread-message--assistant'}
            >
              <p className="thread-sender">{msg.sender === 'user' ? 'You' : 'AI'}</p>
              <ReactMarkdown>{msg.message}</ReactMarkdown>

              {msg.sender === 'assistant' && msg.restaurants && msg.restaurants.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <p style={{
                    fontSize: '0.78rem', fontWeight: '700', color: '#888',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px',
                  }}>📌 Restaurant Details</p>
                  {msg.restaurants.map((r, i) => (
                    <RestaurantCard key={r.name || i} restaurant={r} />
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="chat-compose">
          {role === 'diner' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              
              {locError && <span style={{ color: '#d9534f', fontSize: '0.85rem' }}>{locError}</span>}
            </div>
          )}
          <textarea rows={2} value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Send a message" required />
          <button type="submit" className="chat-btn chat-btn--primary" disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default ChatPage