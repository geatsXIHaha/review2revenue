import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'

const API_BASE = 'http://localhost:8000'

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

function App() {
  const [role, setRole] = useState('diner')
  const [prompt, setPrompt] = useState(dinerExamples[0])
  const [restaurantName, setRestaurantName] = useState('')
  const [externalReviewsText, setExternalReviewsText] = useState('')
  const [restaurantOptions, setRestaurantOptions] = useState([])
  const [showRestaurantDropdown, setShowRestaurantDropdown] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  const roleExamples = role === 'diner' ? dinerExamples : vendorExamples

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

  async function handleSubmit(event) {
    event.preventDefault()
    setIsLoading(true)
    setError('')

    const externalReviews = externalReviewsText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    const payload = {
      role,
      prompt,
      restaurant_name: restaurantName,
      external_reviews: role === 'vendor' && externalReviews.length > 0 ? externalReviews : undefined,
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
    } catch (submitError) {
      setError(submitError.message)
      setResult('')
    } finally {
      setIsLoading(false)
    }
  }

  function handleRoleChange(nextRole) {
    setRole(nextRole)
    setPrompt(nextRole === 'diner' ? dinerExamples[0] : vendorExamples[0])
    setRestaurantName('')
    setExternalReviewsText('')
    setRestaurantOptions([])
    setShowRestaurantDropdown(false)
    setResult('')
    setError('')
  }

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">Review2Revenue</p>
        <h1>AI Restaurant Decision System</h1>
        <p className="subtext">
          React frontend with Python backend, PostgreSQL data, and Z.AI reasoning.
        </p>
      </header>

      <section className="panel">
        <div className="role-tabs" role="tablist" aria-label="Choose role">
          <button
            type="button"
            className={role === 'diner' ? 'tab active' : 'tab'}
            onClick={() => handleRoleChange('diner')}
          >
            User View
          </button>
          <button
            type="button"
            className={role === 'vendor' ? 'tab active' : 'tab'}
            onClick={() => handleRoleChange('vendor')}
          >
            Vendor View
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
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
            <span>Restaurant Name (optional for user, useful for vendor)</span>
            <div className="restaurant-search-wrap">
              <input
                type="text"
                value={restaurantName}
                onChange={(event) => setRestaurantName(event.target.value)}
                onFocus={() => setShowRestaurantDropdown(restaurantOptions.length > 0)}
                onBlur={() => setTimeout(() => setShowRestaurantDropdown(false), 120)}
                placeholder="Example: Village Nasi Lemak"
              />
              {role === 'vendor' && showRestaurantDropdown && restaurantOptions.length > 0 ? (
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
            {role === 'vendor' ? (
              <small className="field-hint">Type restaurant name to see matches from clean_restaurants data.</small>
            ) : null}
          </label>

          {role === 'vendor' ? (
            <label className="field">
              <span>
                External Reviews for Unlisted Restaurant (one review per line)
              </span>
              <textarea
                rows={6}
                value={externalReviewsText}
                onChange={(event) => setExternalReviewsText(event.target.value)}
                placeholder="Paste reviews here when the restaurant is not in database"
              />
            </label>
          ) : null}

          <div className="actions">
            <button type="submit" className="primary" disabled={isLoading}>
              {isLoading ? 'Generating...' : 'Generate AI Answer'}
            </button>
          </div>
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
          {error ? <p className="error">{error}</p> : null}
          {!error && result ? <ReactMarkdown>{result}</ReactMarkdown> : <p>Submit a prompt to see the result.</p>}
        </section>
      </section>
    </main>
  )
}

export default App
