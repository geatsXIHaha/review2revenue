import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './ChatPage.css'
import { useGeolocation } from './hooks/useGeolocation';

const API_BASE = 'http://localhost:8000'
const CHAT_CACHE_PREFIX = 'review2revenue.chatCache.v1'

function getChatCacheKey(userId, role) {
  return `${CHAT_CACHE_PREFIX}.${role || 'diner'}.${userId || 'anonymous'}`
}

function safeJsonParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function normalizeConversationRows(data) {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.conversations)
      ? data.conversations
      : Array.isArray(data?.rows)
        ? data.rows
        : []

  return rows
    .map((conversation) => ({
      conversation_id: conversation?.conversation_id || conversation?.conversationId || conversation?.id || '',
      last_message: conversation?.last_message || conversation?.lastMessage || conversation?.preview || conversation?.title || 'Untitled chat',
      updated_at: conversation?.updated_at || conversation?.updatedAt || conversation?.modified_at || new Date().toISOString(),
    }))
    .filter((conversation) => Boolean(conversation.conversation_id))
}

function normalizeHistoryMessages(data) {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.messages)
      ? data.messages
      : Array.isArray(data?.history)
        ? data.history
        : Array.isArray(data?.data)
          ? data.data
          : []

  return rows.map((message, index) => ({
    id: message?.id || message?.message_id || `${index}`,
    role: message?.role || message?.sender || (message?.is_assistant ? 'assistant' : 'user'),
    message: message?.message || message?.text || message?.content || '',
    restaurants: Array.isArray(message?.restaurants)
      ? message.restaurants
      : (Array.isArray(message?.restaurants_json) ? message.restaurants_json : []),
  }))
}

function readChatCache(userId, role) {
  if (typeof sessionStorage === 'undefined') {
    return { conversations: [], messagesByConversation: {} }
  }

  const raw = sessionStorage.getItem(getChatCacheKey(userId, role))
  const parsed = safeJsonParse(raw, null)
  return {
    conversations: Array.isArray(parsed?.conversations) ? parsed.conversations : [],
    messagesByConversation: parsed?.messagesByConversation && typeof parsed.messagesByConversation === 'object'
      ? parsed.messagesByConversation
      : {},
  }
}

function writeChatCache(userId, role, conversations, messagesByConversation) {
  if (typeof sessionStorage === 'undefined' || !userId) return

  try {
    sessionStorage.setItem(
      getChatCacheKey(userId, role),
      JSON.stringify({
        conversations: Array.isArray(conversations) ? conversations : [],
        messagesByConversation: messagesByConversation && typeof messagesByConversation === 'object'
          ? messagesByConversation
          : {},
      }),
    )
  } catch {
    // Ignore cache write failures so the chat stays usable.
  }
}

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

function buildConversationRow(conversationId, lastMessage, updatedAt = new Date().toISOString()) {
  return {
    conversation_id: conversationId,
    last_message: lastMessage || 'Untitled chat',
    updated_at: updatedAt,
  }
}

function mergeConversationRows(existingRows, incomingRows) {
  const merged = new Map()
  ;[...(Array.isArray(existingRows) ? existingRows : []), ...(Array.isArray(incomingRows) ? incomingRows : [])].forEach((conversation) => {
    if (!conversation?.conversation_id) return
    merged.set(conversation.conversation_id, conversation)
  })

  return Array.from(merged.values()).sort((left, right) => {
    const leftTime = new Date(left.updated_at || 0).getTime()
    const rightTime = new Date(right.updated_at || 0).getTime()
    return rightTime - leftTime
  })
}

function getPendingChatTransition() {
  try {
    const raw = sessionStorage.getItem('pendingChatTransition')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// ── Normalise a raw menu item's category to a plain trimmed string ─────────────
function normalizeCategory(item) {
  if (!item) return ''
  const raw =
    (typeof item.category === 'string' && item.category) ||
    (item.category && typeof item.category === 'object' && (item.category.name || item.category.title)) ||
    item.category_name ||
    item.section ||
    ''
  return String(raw).trim()
}

// ── Sort menu items: by category alphabetically, then price asc, then name asc ─
function sortMenuItems(items) {
  return (items || []).slice().sort((a, b) => {
    const ca = (a.category || '').toLowerCase()
    const cb = (b.category || '').toLowerCase()
    if (ca < cb) return -1
    if (ca > cb) return 1
    const pa = a.price_rm === null || a.price_rm === undefined ? Infinity : Number(a.price_rm)
    const pb = b.price_rm === null || b.price_rm === undefined ? Infinity : Number(b.price_rm)
    if (pa !== pb) return pa - pb
    const ia = (a.item_name || '').toLowerCase()
    const ib = (b.item_name || '').toLowerCase()
    if (ia < ib) return -1
    if (ia > ib) return 1
    return 0
  })
}

// ── Restaurant Card ────────────────────────────────────────────────────────────
function RestaurantCard({ restaurant, userProfile }) {
  const [showMenu, setShowMenu] = useState(false)
  const [menuItems, setMenuItems] = useState([])
  const [isLoadingMenu, setIsLoadingMenu] = useState(false)
  const [menuError, setMenuError] = useState('')
  const [showReviews, setShowReviews] = useState(false)
  const [reviews, setReviews] = useState([])
  const [isLoadingReviews, setIsLoadingReviews] = useState(false)
  const [reviewsError, setReviewsError] = useState('')
  const [reviewFilter, setReviewFilter] = useState('all')

  function renderRatingStars(value) {
    const raw = Number(value)
    if (!Number.isFinite(raw)) return '☆☆☆☆☆'
    const clamped = Math.max(0, Math.min(5, raw))
    const rounded = Math.round(clamped)
    return '★'.repeat(rounded) + '☆'.repeat(5 - rounded)
  }

  async function fetchReviews() {
  if (!restaurant?.store_id) {
    setReviewsError('No store_id available for this restaurant')
    return
  }

  setIsLoadingReviews(true)
  setReviews([])
  setReviewsError('')

  try {
    const response = await fetch(`${API_BASE}/api/reviews/by-store-id?store_id=${encodeURIComponent(restaurant.store_id)}`)
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.detail || `Failed to fetch reviews (status ${response.status})`)
    }
    const data = await response.json()
    // Adjust depending on your API response shape
    setReviews(Array.isArray(data) ? data : (data.reviews || []))
    setShowReviews(true)
  } catch (err) {
    console.error('Reviews fetch error:', err)
    setReviewsError(err.message || 'Failed to fetch reviews')
    setShowReviews(false)
  } finally {
    setIsLoadingReviews(false)
  }
}

  async function fetchMenu() {
    // Prefer embedded menu_items if provided by backend
    if (Array.isArray(restaurant?.menu_items) && restaurant.menu_items.length > 0) {
      const normalized = restaurant.menu_items.map((it) => ({
        ...it,
        category: normalizeCategory(it),
      }))
      setMenuItems(sortMenuItems(normalized))
      setMenuError('')
      setShowMenu(true)
      return
    }

    if (!restaurant?.store_id) {
      setMenuError('No store_id available for this restaurant')
      return
    }

    setIsLoadingMenu(true)
    setMenuItems([])
    setMenuError('')
    try {
      // Use grouped endpoint which guarantees category + items
      const response = await fetch(`${API_BASE}/api/menu/grouped?store_id=${encodeURIComponent(restaurant.store_id)}`)
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        const msg = err.detail || `Failed to fetch menu (status ${response.status})`
        throw new Error(msg)
      }
      const data = await response.json()
      if (Array.isArray(data.categories)) {
        // flatten categories → items, stamping category onto each item
        const flat = []
        data.categories.forEach((cat) => {
          const cname = (cat.category || 'Uncategorized').toString().trim()
          ;(cat.items || []).forEach((it) => {
            flat.push({ ...it, category: cname })
          })
        })
        setMenuItems(sortMenuItems(flat))
      } else {
        setMenuItems(Array.isArray(data.menu_items) ? sortMenuItems(
          data.menu_items.map((it) => ({ ...it, category: normalizeCategory(it) }))
        ) : [])
      }
      setShowMenu(true)
    } catch (err) {
      console.error('Menu fetch error:', err)
      setMenuError(err.message || 'Failed to fetch menu')
      setShowMenu(false)
    } finally {
      setIsLoadingMenu(false)
    }
  }

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

      {/* Menu button, reviews button and content */}
      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={showMenu ? () => setShowMenu(false) : fetchMenu} disabled={isLoadingMenu} style={{
            background: '#111827', color: '#fff', borderRadius: '8px', padding: '8px 12px', fontWeight: 700, border: 'none', cursor: 'pointer',
          }}>
            {isLoadingMenu ? 'Loading menu...' : (showMenu ? 'Hide Menu' : 'View Menu')}
          </button>

          <button onClick={() => { if (!showReviews) fetchReviews(); else setShowReviews(false) }} disabled={isLoadingReviews} style={{
            background: '#0b74de', color: '#fff', borderRadius: '8px', padding: '8px 12px', fontWeight: 700, border: 'none', cursor: 'pointer',
          }}>
            {isLoadingReviews ? 'Loading reviews...' : (showReviews ? 'Hide Reviews' : 'View Reviews')}
          </button>
        </div>

        {menuError && (
          <p style={{ marginTop: '0px', fontSize: '0.85rem', color: '#d32f2f' }}>{menuError}</p>
        )}

        {reviewsError && (
          <p style={{ marginTop: '0px', fontSize: '0.85rem', color: '#d32f2f' }}>{reviewsError}</p>
        )}

        {showMenu && !isLoadingMenu && menuItems.length === 0 && (
          <p style={{ marginTop: '0px', fontSize: '0.85rem', color: '#666' }}>No menu items found.</p>
        )}

        {showMenu && menuItems.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            {(() => {
              // Group by category
              const groups = menuItems.reduce((acc, mi) => {
                const raw = (mi.category || '').toString().trim()
                const cat = raw.length > 0
                  ? raw.charAt(0).toUpperCase() + raw.slice(1)
                  : 'Uncategorized'
                if (!acc[cat]) acc[cat] = []
                acc[cat].push(mi)
                return acc
              }, {})

              return Object.keys(groups).sort().map((cat) => (
                <div key={cat} style={{ marginBottom: '10px' }}>
                  <h4 style={{ margin: '6px 0', fontSize: '0.9rem', fontWeight: 700, color: '#444' }}>{cat}</h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {groups[cat].map((mi, idx) => (
                      <li key={mi.menu_id || idx} style={{
                        display: 'flex', justifyContent: 'space-between',
                        padding: '6px 0', borderTop: idx ? '1px solid #f3f3f3' : 'none',
                      }}>
                        <span style={{ fontWeight: 600 }}>{mi.item_name}</span>
                        <span style={{ color: '#444' }}>RM {Number(mi.price_rm || 0).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            })()}
          </div>
        )}

     {showReviews && (
          <div style={{ marginTop: '8px', padding: '10px', background: '#fafafa', borderRadius: '8px' }}>
            {isLoadingReviews ? (
              <p style={{ margin: 0 }}>Loading reviews...</p>
            ) : (
              <>
                <div style={{ marginBottom: '8px' }}>
                  <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#888' }}>
                    <strong>Latest Reviews (Newest First)</strong>
                  </p>
                  <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', color: '#aaa' }}>
                    Total reviews: {reviews.length} | Showing: {
                      reviews.filter(r => {
                        if (reviewFilter === 'all') return true
                        const s = (r.sentiment || '').toLowerCase()
                        const rating = Number(r.overall_rating || r.rating || 0)
                        if (reviewFilter === 'positive') return s === 'positive' || rating >= 4
                        if (reviewFilter === 'negative') return s === 'negative' || rating <= 2
                        if (reviewFilter === 'neutral') return s === 'neutral' || rating === 3
                        return true
                      }).length
                    }
                  </p>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {['all', 'positive', 'negative', 'neutral'].map(f => (
                      <button
                        key={f}
                        onClick={() => setReviewFilter(f)}
                        style={{
                          padding: '4px 12px', borderRadius: '20px', border: '1.5px solid',
                          fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                          background: reviewFilter === f ? (
                            f === 'positive' ? '#22c55e' :
                            f === 'negative' ? '#ef4444' :
                            f === 'neutral' ? '#f59e0b' : '#111827'
                          ) : '#fff',
                          color: reviewFilter === f ? '#fff' : (
                            f === 'positive' ? '#22c55e' :
                            f === 'negative' ? '#ef4444' :
                            f === 'neutral' ? '#f59e0b' : '#555'
                          ),
                          borderColor: (
                            f === 'positive' ? '#22c55e' :
                            f === 'negative' ? '#ef4444' :
                            f === 'neutral' ? '#f59e0b' : '#ccc'
                          ),
                        }}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                {(() => {
                  const filtered = reviews.filter(r => {
                    if (reviewFilter === 'all') return true
                    const s = (r.sentiment || '').toLowerCase()
                    const rating = Number(r.overall_rating || r.rating || 0)
                    if (reviewFilter === 'positive') return s === 'positive' || rating >= 4
                    if (reviewFilter === 'negative') return s === 'negative' || rating <= 2
                    if (reviewFilter === 'neutral') return s === 'neutral' || rating === 3
                    return true
                  })
                  return filtered.length === 0 ? (
                    <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>No reviews found for this restaurant.</p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {filtered.map((rev, idx) => (
                        <li key={rev.id || idx} style={{ padding: '8px 0', borderTop: idx ? '1px solid #eee' : 'none' }}>
                          <p style={{ margin: '0 0 6px 0', fontSize: '0.85rem' }}>{rev.review_text || rev.text || rev.message || ''}</p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 700, color: '#f59e0b' }}>{renderRatingStars(rev.overall_rating || rev.rating || 0)}</span>
                              {rev.sentiment && (
                                <span style={{
                                  fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '20px',
                                  background: rev.sentiment === 'positive' ? '#dcfce7' : rev.sentiment === 'negative' ? '#fee2e2' : '#fef9c3',
                                  color: rev.sentiment === 'positive' ? '#15803d' : rev.sentiment === 'negative' ? '#b91c1c' : '#92400e',
                                }}>
                                  {rev.sentiment}
                                </span>
                              )}
                            </div>
                            <small style={{ color: '#aaa' }}>{rev.updated_at ? new Date(rev.updated_at).toLocaleString() : ''}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )
                })()}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ChatPage ──────────────────────────────────────────────────────────────
function ChatPage({ userProfile }) {
  const userId = userProfile?.id || ''
  const registeredRole = userProfile?.role || 'diner'
  const role = registeredRole
  const [prompt, setPrompt] = useState('')
  const [externalReviewsText, setExternalReviewsText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [conversationId, setConversationId] = useState('')
  const [conversations, setConversations] = useState([])
  const [messagesByConversation, setMessagesByConversation] = useState({})
  const [error, setError] = useState('')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const transitionStartedRef = useRef(false)
  const optimisticConversationIdRef = useRef('')
  const historyRequestRef = useRef(0)
  const threadRef = useRef(null)
  const messageCacheRef = useRef({})
  const [vendorRestaurantName, setVendorRestaurantName] = useState('')

  const { coords, cityName, error: locError } = useGeolocation();
  const roleExamples = role === 'diner' ? dinerExamples : vendorExamples

  function navigateTo(path) {
    if (window.location.pathname === path) return
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  function upsertConversationPreview(previousConversationId, nextConversationId, lastMessage, updatedAt) {
    if (!nextConversationId) return
    const row = buildConversationRow(nextConversationId, lastMessage, updatedAt)
    setConversations((prev) => {
      const filtered = prev.filter(
        (conversation) => conversation.conversation_id !== previousConversationId && conversation.conversation_id !== nextConversationId,
      )
      return [row, ...filtered]
    })
  }

  function setConversationRows(rows) {
    setConversations((prev) => mergeConversationRows(prev, rows))
  }

  function cacheConversationMessages(targetConversationId, messages) {
    if (!targetConversationId) return
    setMessagesByConversation((prev) => ({
      ...prev,
      [targetConversationId]: Array.isArray(messages) ? messages : [],
    }))
  }

  async function fetchConversations(roleValue) {
    try {
      if (!userId) return []
      const response = await fetch(
        `${API_BASE}/api/chat/conversations?role=${encodeURIComponent(roleValue)}&user_id=${encodeURIComponent(userId)}&limit=100`,
      )
      if (!response.ok) return []
      const data = await response.json()
      return normalizeConversationRows(data)
    } catch { return [] }
  }

  async function fetchHistory(roleValue, convId, requestId) {
    if (!convId) { setChatMessages([]); return }
    const cachedMessages = messageCacheRef.current?.[convId]
    if (Array.isArray(cachedMessages) && cachedMessages.length > 0) {
      setChatMessages(cachedMessages)
    }
    setIsHistoryLoading(true)
    const pending = getPendingChatTransition()
    const isPendingConversation = pending?.conversation_id === convId && pending?.role === role && pending?.user_id === userId
    const maxAttempts = roleValue === 'vendor' ? 3 : 1

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await fetch(
          `${API_BASE}/api/chat/history?conversation_id=${encodeURIComponent(convId)}&role=${encodeURIComponent(roleValue)}`,
        )
        if (requestId !== historyRequestRef.current) return
        if (!response.ok) {
          break
        }

        const data = await response.json()
        const messages = normalizeHistoryMessages(data).map((m, index) => ({
          id: m.id ? `${convId}-${m.id}` : `${convId}-${index}`,
          role: m.role === 'assistant' ? 'assistant' : 'user',
          message: m.message || '',
          restaurants: Array.isArray(m.restaurants)
            ? m.restaurants
            : (Array.isArray(m.restaurants_json) ? m.restaurants_json : []),
        }))

        if (messages.length > 0) {
          setChatMessages(messages)
          cacheConversationMessages(convId, messages)
          setIsHistoryLoading(false)
          return
        }

        if (isPendingConversation || convId === optimisticConversationIdRef.current) {
          setIsHistoryLoading(false)
          return
        }

        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 220))
        }
      } catch {
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 220))
        }
      }
    }

    if (
      requestId === historyRequestRef.current
      && !isPendingConversation
      && convId !== optimisticConversationIdRef.current
      && (!Array.isArray(cachedMessages) || cachedMessages.length === 0)
    ) {
      setChatMessages([])
    }
    setIsHistoryLoading(false)
  }

  useEffect(() => {
    messageCacheRef.current = messagesByConversation
  }, [messagesByConversation])

  useEffect(() => {
    writeChatCache(userId, role, conversations, messagesByConversation)
  }, [userId, role, conversations, messagesByConversation])

  useEffect(() => {
    const pending = getPendingChatTransition()
    const pendingConversationId = pending?.conversation_id && pending?.role === role && pending?.user_id === userId ? pending.conversation_id : ''

    async function initRoleChats() {
      const cached = readChatCache(userId, role)
      setConversationRows(cached.conversations)
      setMessagesByConversation(cached.messagesByConversation)

      const rows = await fetchConversations(role)
      const mergedRows = mergeConversationRows(cached.conversations, rows)
      setConversations(mergedRows)
      if (pendingConversationId) {
        optimisticConversationIdRef.current = pendingConversationId
        setConversationId(pendingConversationId)
        return
      }
      if (mergedRows.length > 0) setConversationId(mergedRows[0].conversation_id)
      else setConversationId(createConversationId())
    }
    initRoleChats()
  }, [role, userId])

  useEffect(() => {
    const pending = getPendingChatTransition()
    const shouldPauseHistoryFetch =
      isTransitioning
      && pending?.conversation_id
      && pending?.conversation_id === conversationId
      && pending?.role === role
      && pending?.user_id === userId
    if (shouldPauseHistoryFetch) return

    const requestId = historyRequestRef.current + 1
    historyRequestRef.current = requestId
    fetchHistory(role, conversationId, requestId)
  }, [role, conversationId, isTransitioning, userId])

  useEffect(() => {
    if (!userId) return
    const raw = sessionStorage.getItem('pendingChatTransition')
    if (!raw) return

    let pending
    try {
      pending = JSON.parse(raw)
    } catch {
      sessionStorage.removeItem('pendingChatTransition')
      return
    }

    if (!pending?.question || !pending?.answer || !pending?.role || pending.user_id !== userId) {
      sessionStorage.removeItem('pendingChatTransition')
      return
    }
    if (pending.role !== role) {
      sessionStorage.removeItem('pendingChatTransition')
      return
    }
    if (transitionStartedRef.current) {
      return
    }

    let cancelled = false
    async function persistInitialInteraction() {
      transitionStartedRef.current = true
      setIsTransitioning(true)
      setError('')
      const pendingConversationId = pending.conversation_id || createConversationId()
      optimisticConversationIdRef.current = pendingConversationId
      const optimisticMessages = [
        { id: `pending-u-${pendingConversationId}`, role: 'user', message: pending.question, restaurants: [] },
        {
          id: `pending-a-${pendingConversationId}`,
          role: 'assistant',
          message: pending.answer,
          restaurants: Array.isArray(pending.restaurants) ? pending.restaurants : [],
        },
      ]
      setConversationId(pendingConversationId)
      setChatMessages(optimisticMessages)
      cacheConversationMessages(pendingConversationId, optimisticMessages)
      upsertConversationPreview(pendingConversationId, pendingConversationId, pending.answer)
      sessionStorage.setItem(
        'pendingChatTransition',
        JSON.stringify({ ...pending, conversation_id: pendingConversationId }),
      )
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 12000)
        const response = await fetch(`${API_BASE}/api/chat/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            conversation_id: pendingConversationId,
            user_id: userId,
            role,
            question: pending.question,
            answer: pending.answer,
            restaurants: Array.isArray(pending.restaurants) ? pending.restaurants : [],
          }),
        })
        clearTimeout(timeoutId)
        if (!response.ok) throw new Error('Failed to initialize chat conversation.')

        if (cancelled) return
        const data = await response.json()
        const persistedConversationId = data.conversation_id || pendingConversationId
        setConversationId(persistedConversationId)
        optimisticConversationIdRef.current = persistedConversationId
        upsertConversationPreview(pendingConversationId, persistedConversationId, pending.answer, data.updated_at)
        sessionStorage.removeItem('pendingChatTransition')

        const rows = await fetchConversations(role)
        if (!cancelled) setConversationRows(rows)
      } catch (transitionError) {
        sessionStorage.removeItem('pendingChatTransition')
        if (!cancelled) {
          setError(transitionError?.name === 'AbortError' ? 'Chat initialization timed out. You can continue chatting and messages will sync on next send.' : (transitionError.message || 'Failed to initialize chat conversation.'))
          setChatMessages(optimisticMessages)
          cacheConversationMessages(pendingConversationId, optimisticMessages)
        }
      } finally {
        transitionStartedRef.current = false
        setIsTransitioning(false)
      }
    }

    persistInitialInteraction()
    return () => { cancelled = true }
  }, [userId, role])

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [chatMessages, isLoading])

  useEffect(() => {
    if (role !== 'vendor' || !userProfile?.store_id) {
      setVendorRestaurantName('')
      return
    }
    let cancelled = false
    async function fetchVendorRestaurant() {
      try {
        const response = await fetch(
          `${API_BASE}/api/restaurants/by-store-id?store_id=${encodeURIComponent(userProfile.store_id)}`,
        )
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled) {
          setVendorRestaurantName(data?.restaurant?.name || '')
        }
      } catch {
        if (!cancelled) setVendorRestaurantName('')
      }
    }
    fetchVendorRestaurant()
    return () => {
      cancelled = true
    }
  }, [role, userProfile?.store_id])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!prompt.trim()) return
    setError('')
    const submittedPrompt = prompt

    if (role === 'vendor' && !userId) {
      setError('Vendor profile is still loading. Please try again in a moment.')
      return
    }

    const activeConversationId = conversationId || createConversationId()
    if (!conversationId) setConversationId(activeConversationId)
    optimisticConversationIdRef.current = activeConversationId

    const externalReviews = externalReviewsText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    const userMessage = { id: `u-${Date.now()}`, role: 'user', message: submittedPrompt, restaurants: [] }
    setChatMessages((prev) => {
      const next = [...prev, userMessage]
      cacheConversationMessages(activeConversationId, next)
      return next
    })
    setPrompt('')
    upsertConversationPreview(activeConversationId, activeConversationId, submittedPrompt)
    setIsLoading(true)

    let locationPayload = {}
    if (role === 'diner' && coords) {
      locationPayload = { user_lat: coords.lat, user_lng: coords.lng, city_name: cityName }
    } else if (role === 'diner' && isNearestIntent(submittedPrompt)) {
      try {
        const loc = await getDeviceLocation()
        locationPayload = { user_lat: loc.lat, user_lng: loc.lng }
      } catch (locErr) {
        setError(`Location is required for nearest queries. ${locErr.message}`)
        setChatMessages((prev) => {
          const next = prev.slice(0, Math.max(prev.length - 1, 0))
          cacheConversationMessages(activeConversationId, next)
          return next
        })
        setIsLoading(false)
        return
      }
    }

    const payload = {
      role, prompt: submittedPrompt,
      conversation_id: activeConversationId,
      user_id: userId || undefined,
      persist: true,
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

      const assistantMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        message: data.answer || 'No answer returned by backend.',
        restaurants: Array.isArray(data.restaurants) ? data.restaurants : [],
      }

      setChatMessages((prev) => {
        const next = [...prev, assistantMessage]
        cacheConversationMessages(activeConversationId, next)
        return next
      })
      const persistedConversationId = data.conversation_id || activeConversationId
      setConversationId(persistedConversationId)
      optimisticConversationIdRef.current = persistedConversationId
      if (persistedConversationId !== activeConversationId) {
        const sourceMessages = messageCacheRef.current?.[activeConversationId] || []
        if (sourceMessages.length > 0) {
          cacheConversationMessages(persistedConversationId, sourceMessages)
        }
      }
      upsertConversationPreview(activeConversationId, persistedConversationId, data.answer || submittedPrompt, data.updated_at)

      const rows = await fetchConversations(role)
      setConversationRows(rows)
    } catch (submitError) {
      setError(submitError.message)
      setChatMessages((prev) => {
        const next = prev.slice(0, Math.max(prev.length - 1, 0))
        cacheConversationMessages(activeConversationId, next)
        return next
      })
    } finally {
      setIsLoading(false)
    }
  }

  function handleNewChat() {
    const nextConversationId = createConversationId()
    optimisticConversationIdRef.current = nextConversationId
    setConversationId(nextConversationId)
    setChatMessages([])
    cacheConversationMessages(nextConversationId, [])
    setPrompt('')
    setError('')
    upsertConversationPreview(nextConversationId, nextConversationId, 'Untitled chat')
  }

  function handleComposeKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!isLoading && prompt.trim()) {
        event.currentTarget.form?.requestSubmit()
      }
    }
  }

  const activeConversationLabel = useMemo(() => {
    const found = conversations.find((c) => c.conversation_id === conversationId)
    return found ? shortPreview(found.last_message) : 'New chat'
  }, [conversations, conversationId])

  useEffect(() => {
    if (!conversationId) return
    const exists = conversations.some((conversation) => conversation.conversation_id === conversationId)
    if (exists) return

    const pending = getPendingChatTransition()
    const pendingQuestion =
      pending?.conversation_id === conversationId
      && pending?.role === role
      && pending?.user_id === userId
      ? pending.question
      : ''

    const latestMessage =
      chatMessages.length > 0
        ? chatMessages[chatMessages.length - 1]?.message
        : (pendingQuestion || 'Untitled chat')

    upsertConversationPreview(conversationId, conversationId, latestMessage || 'Untitled chat')
  }, [conversationId, conversations, chatMessages, isTransitioning, role, userId])

  return (
    <main className={role === 'vendor' ? 'chat-page chat-page--vendor' : 'chat-page'}>
      <aside className="chat-sidebar">
        <div className="chat-sidebar-header">
          <button type="button" className="chat-btn chat-btn--primary" onClick={handleNewChat}>+ New Chat</button>
          <button type="button" className="chat-btn" onClick={() => { navigateTo('/') }}>Back</button>
        </div>

        <div className="chat-role-badge-wrap">
          <span className="chat-role-badge">{role === 'vendor' ? 'Vendor' : 'Diner'}</span>
        </div>

        <ul className="conversation-list">
          {conversations.map((conversation) => (
            <li key={conversation.conversation_id}>
              <button
                type="button"
                className={conversationId === conversation.conversation_id ? 'conversation-item active' : 'conversation-item'}
                onClick={() => {
                  setConversationId(conversation.conversation_id)
                  const cachedMessages = messageCacheRef.current?.[conversation.conversation_id]
                  if (Array.isArray(cachedMessages) && cachedMessages.length > 0) {
                    setChatMessages(cachedMessages)
                  }
                }}
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
          <div className="chat-header-meta">
            <p>{role === 'vendor' ? 'Vendor assistant' : 'Food recommendation assistant'}</p>
            <span className="chat-role-badge">{role === 'vendor' ? 'Vendor' : 'Diner'}</span>
            {role === 'vendor' && vendorRestaurantName ? (
              <span className="restaurant-badge">{vendorRestaurantName}</span>
            ) : null}
          </div>
        </header>

        {isTransitioning && <p className="chat-error">Saving your initial Q&A and preparing chat...</p>}
        {error && <p className="chat-error">{error}</p>}

        <div className="chat-thread" ref={threadRef}>
          {isHistoryLoading && chatMessages.length === 0 ? (
            <div className="chat-empty">
              <p>Loading previous messages...</p>
            </div>
          ) : null}

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
              className={msg.role === 'user' ? 'thread-message thread-message--user' : 'thread-message thread-message--assistant'}
            >
              <p className="thread-sender">{msg.role === 'assistant' ? 'AI' : 'You'}</p>
              <ReactMarkdown>{msg.message}</ReactMarkdown>

              {msg.role === 'assistant' && msg.restaurants && msg.restaurants.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <p style={{
                    fontSize: '0.78rem', fontWeight: '700', color: '#888',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px',
                  }}>📌 Restaurant Details</p>
                  {msg.restaurants.map((r, i) => (
                    <RestaurantCard key={r.name || i} restaurant={r} userProfile={userProfile} />
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="chat-compose">
          {role === 'diner' && locError ? <p className="chat-loc-error">{locError}</p> : null}
          <textarea rows={2} value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleComposeKeyDown}
            placeholder="Send a message" required />
          <button
            type="submit"
            className="chat-btn chat-btn--primary"
            disabled={isLoading || (role === 'vendor' && !userId) || !prompt.trim()}
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default ChatPage