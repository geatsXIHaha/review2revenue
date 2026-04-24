import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './ChatPage.css'

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

function createConversationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `conv-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function shortPreview(text) {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= 40) {
    return clean || 'Untitled chat'
  }
  return `${clean.slice(0, 40)}...`
}

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

  const roleExamples = role === 'diner' ? dinerExamples : vendorExamples

  async function fetchConversations(roleValue) {
    try {
      const response = await fetch(`${API_BASE}/api/chat/conversations?role=${encodeURIComponent(roleValue)}&limit=100`)
      if (!response.ok) {
        return []
      }
      return await response.json()
    } catch {
      return []
    }
  }

  async function fetchHistory(roleValue, convId) {
    if (!convId) {
      setChatMessages([])
      return
    }
    try {
      const response = await fetch(
        `${API_BASE}/api/chat/history?conversation_id=${encodeURIComponent(convId)}&role=${encodeURIComponent(roleValue)}`,
      )
      if (!response.ok) {
        setChatMessages([])
        return
      }
      const data = await response.json()
      const messages = (data.messages || []).map((m, index) => ({
        id: `${convId}-${index}`,
        sender: m.sender || 'assistant',
        message: m.message || '',
      }))
      setChatMessages(messages)
    } catch {
      setChatMessages([])
    }
  }

  useEffect(() => {
    async function initRoleChats() {
      const rows = await fetchConversations(role)
      setConversations(rows)
      if (rows.length > 0) {
        setConversationId(rows[0].conversation_id)
      } else {
        setConversationId(createConversationId())
      }
    }
    initRoleChats()
  }, [role])

  useEffect(() => {
    fetchHistory(role, conversationId)
  }, [role, conversationId])

  useEffect(() => {
    if (role !== 'vendor') {
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
      } catch {
        setRestaurantOptions([])
        setShowRestaurantDropdown(false)
      }
    }

    fetchOptions()
    return () => controller.abort()
  }, [role, restaurantName])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!prompt.trim()) {
      return
    }

    setError('')
    if (role === 'vendor' && restaurantName.trim().length < 1) {
      setError('Vendor role requires restaurant name.')
      return
    }

    const activeConversationId = conversationId || createConversationId()
    if (!conversationId) {
      setConversationId(activeConversationId)
    }

    const externalReviews = externalReviewsText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    const userMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      message: prompt,
    }
    setChatMessages((prev) => [...prev, userMessage])
    setIsLoading(true)

    let locationPayload = {}
    if (role === 'diner' && isNearestIntent(prompt)) {
      try {
        const loc = await getDeviceLocation()
        locationPayload = { user_lat: loc.lat, user_lng: loc.lng }
      } catch (locError) {
        setError(`Location is required for nearest queries. ${locError.message}`)
        setChatMessages((prev) => prev.slice(0, Math.max(prev.length - 1, 0)))
        setIsLoading(false)
        return
      }
    }

    const payload = {
      role,
      prompt,
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

      if (!response.ok) {
        throw new Error('Backend request failed.')
      }

      const data = await response.json()
      const assistantMessage = {
        id: `a-${Date.now()}`,
        sender: 'assistant',
        message: data.answer || 'No answer returned by backend.',
      }
      setChatMessages((prev) => [...prev, assistantMessage])
      setPrompt('')

      const rows = await fetchConversations(role)
      setConversations(rows)
      if (data.conversation_id) {
        setConversationId(data.conversation_id)
      }
    } catch (submitError) {
      setError(submitError.message)
      setChatMessages((prev) => prev.slice(0, Math.max(prev.length - 1, 0)))
    } finally {
      setIsLoading(false)
    }
  }

  function handleNewChat() {
    const next = createConversationId()
    setConversationId(next)
    setChatMessages([])
    setPrompt('')
    setError('')
  }

  const activeConversationLabel = useMemo(() => {
    const found = conversations.find((c) => c.conversation_id === conversationId)
    if (!found) {
      return 'New chat'
    }
    return shortPreview(found.last_message)
  }, [conversations, conversationId])

  return (
    <main className="chat-page">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-header">
          <button type="button" className="chat-btn chat-btn--primary" onClick={handleNewChat}>+ New Chat</button>
          <button type="button" className="chat-btn" onClick={() => { window.location.href = '/' }}>Back</button>
        </div>

        <div className="chat-role-switch">
          <button
            type="button"
            className={role === 'diner' ? 'chat-role active' : 'chat-role'}
            onClick={() => setRole('diner')}
          >
            User
          </button>
          <button
            type="button"
            className={role === 'vendor' ? 'chat-role active' : 'chat-role'}
            onClick={() => setRole('vendor')}
          >
            Vendor
          </button>
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

        {role === 'vendor' ? (
          <div className="vendor-inline">
            <label>
              Vendor Name
              <div className="restaurant-search-wrap">
                <input
                  type="text"
                  value={restaurantName}
                  onChange={(event) => setRestaurantName(event.target.value)}
                  onFocus={() => setShowRestaurantDropdown(restaurantOptions.length > 0)}
                  onBlur={() => setTimeout(() => setShowRestaurantDropdown(false), 120)}
                  placeholder="Type your restaurant name"
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
            </label>
          </div>
        ) : null}

        {error ? <p className="chat-error">{error}</p> : null}

        <div className="chat-thread">
          {chatMessages.length === 0 ? (
            <div className="chat-empty">
              <p>Start chatting. The AI will remember your previous turns in this conversation.</p>
              <div className="quick-prompts">
                {roleExamples.map((example) => (
                  <button key={example} type="button" onClick={() => setPrompt(example)}>{example}</button>
                ))}
              </div>
            </div>
          ) : null}

          {chatMessages.map((msg) => (
            <article
              key={msg.id}
              className={msg.sender === 'user' ? 'thread-message thread-message--user' : 'thread-message thread-message--assistant'}
            >
              <p className="thread-sender">{msg.sender === 'user' ? 'You' : 'AI'}</p>
              <ReactMarkdown>{msg.message}</ReactMarkdown>
            </article>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="chat-compose">
          <textarea
            rows={2}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Send a message"
            required
          />
          <button type="submit" className="chat-btn chat-btn--primary" disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default ChatPage
