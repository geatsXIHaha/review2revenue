import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../supabase'

/**
 * @typedef {Object} User
 * @property {string} id - Firebase UID
 * @property {string} user_name - User display name
 * @property {string} email - User email
 * @property {string} role - Either 'diner' or 'vendor'
 * @property {string | null} store_id - FK reference to restaurants table
 */

/**
 * @typedef {Object} Restaurant
 * @property {string} store_id - Primary key
 * @property {string} name - Restaurant name
 */

/**
 * @typedef {Object} RegistrationState
 * @property {string} step - Current step: 'role-selection', 'vendor-matching', 'complete'
 * @property {string} role - Selected role: 'diner' or 'vendor'
 * @property {string} restaurantName - Input restaurant name (vendor only)
 * @property {Restaurant | null} matchedRestaurant - Matched restaurant from DB
 * @property {string[]} restaurantSuggestions - Case-insensitive search results
 * @property {boolean} isSearching - Whether restaurant search is in progress
 * @property {boolean} isLoading - Loading state for async operations
 * @property {string} error - Error message if any
 * @property {boolean} isComplete - Whether registration is complete
 */

const INITIAL_STATE = {
  step: 'role-selection',
  role: '',
  restaurantName: '',
  matchedRestaurant: null,
  restaurantSuggestions: [],
  isSearching: false,
  isLoading: false,
  error: '',
  isComplete: false,
}

/**
 * Custom hook for managing the complete registration workflow:
 * 1. Role selection (diner vs vendor)
 * 2. Restaurant lookup for vendors (case-insensitive ILIKE)
 * 3. Database persistence with upsert (handles FK constraints)
 * 4. Returns state and handlers for UI
 *
 * @param {Object} firebaseUser - Firebase user object with uid, email, displayName
 * @returns {Object} Registration state and handlers
 */
export const useRegistration = (firebaseUser) => {
  const [state, setState] = useState(INITIAL_STATE)
  const searchDebounceRef = useRef(null)
  const searchAbortRef = useRef(null)
  const latestSearchIdRef = useRef(0)

  // ============================================
  // HANDLER: Select role (diner or vendor)
  // ============================================
  const selectRole = useCallback((role) => {
    if (role !== 'diner' && role !== 'vendor') {
      setState((prev) => ({ ...prev, error: 'Invalid role selected' }))
      return
    }
    setState((prev) => ({
      ...prev,
      role,
      step: 'role-confirmation',
      error: '',
      restaurantName: '',
      restaurantSuggestions: [],
      matchedRestaurant: null,
    }))
  }, [])

  // ============================================
  // HANDLER: Confirm role and proceed
  // ============================================
  const confirmRole = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: prev.role === 'diner' ? 'complete' : 'vendor-matching',
      error: '',
    }))
  }, [])

  // ============================================
  // HANDLER: Search restaurants (ILIKE)
  // ============================================
  const searchRestaurants = useCallback(async (searchTerm) => {
    // Trim and validate input
    const trimmedTerm = searchTerm.trim()

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = null
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort()
      searchAbortRef.current = null
    }

    setState((prev) => ({
      ...prev,
      restaurantName: searchTerm,
      isSearching: false,
      error: '',
    }))

    // Don't search for empty terms
    if (trimmedTerm.length === 0) {
      setState((prev) => ({
        ...prev,
        restaurantSuggestions: [],
        isSearching: false,
      }))
      return
    }

    // Minimum 2 characters before searching (reduces lag)
    if (trimmedTerm.length < 2) {
      setState((prev) => ({
        ...prev,
        restaurantSuggestions: [],
        isSearching: false,
      }))
      return
    }

    const searchId = ++latestSearchIdRef.current

    searchDebounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      searchAbortRef.current = controller

      setState((prev) => ({
        ...prev,
        isSearching: true,
      }))

      try {
        const { data, error } = await supabase
          .from('restaurants')
          .select('store_id, name')
          .ilike('name', `%${trimmedTerm}%`)
          .limit(10)
          .abortSignal(controller.signal)

        if (error) {
          throw new Error(error.message)
        }

        if (searchId !== latestSearchIdRef.current) {
          return
        }

        setState((prev) => ({
          ...prev,
          restaurantSuggestions: data || [],
          isSearching: false,
        }))
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        if (searchId !== latestSearchIdRef.current) {
          return
        }

        setState((prev) => ({
          ...prev,
          error: `Failed to search restaurants: ${error.message}`,
          restaurantSuggestions: [],
          isSearching: false,
        }))
      }
    }, 250)
  }, [])

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
      if (searchAbortRef.current) {
        searchAbortRef.current.abort()
      }
    }
  }, [])

  // ============================================
  // HANDLER: Select restaurant from suggestions
  // ============================================
  const selectRestaurant = useCallback((restaurant) => {
    setState((prev) => ({
      ...prev,
      matchedRestaurant: restaurant,
      restaurantName: restaurant ? restaurant.name : '',
      restaurantSuggestions: [],
      error: '',
    }))
  }, [])

  // ============================================
  // HANDLER: Finalize registration (save to DB)
  // ============================================
  const completeRegistration = useCallback(async () => {
    if (!firebaseUser) {
      setState((prev) => ({
        ...prev,
        error: 'No Firebase user available',
      }))
      return false
    }

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: '',
    }))

    try {
      // Validate required data
      if (!firebaseUser.uid || !firebaseUser.email) {
        throw new Error('Firebase user must have uid and email')
      }

      if (!state.role) {
        throw new Error('Role must be selected')
      }

      // For vendors, ensure a restaurant is matched
      if (state.role === 'vendor' && !state.matchedRestaurant) {
        throw new Error('Vendor must select a restaurant')
      }

      // Prepare user object
      const userData = {
        id: firebaseUser.uid,
        user_name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
        email: firebaseUser.email,
        role: state.role,
        store_id: state.role === 'vendor' ? state.matchedRestaurant.store_id : null,
      }

      // UPSERT into users table
      // Using ON CONFLICT clause handles cases where user already exists
      const { data, error } = await supabase
        .from('users')
        .upsert([userData], { onConflict: 'id' })
        .select()

      if (error) {
        // Check for foreign key constraint violations
        if (error.message && error.message.includes('foreign key')) {
          throw new Error(
            `Restaurant not found. Please ensure the restaurant exists in the system before registering as a vendor.`
          )
        }
        throw new Error(error.message || 'Failed to save user profile')
      }

      if (!data || data.length === 0) {
        throw new Error('Failed to save user profile: no data returned')
      }

      setState((prev) => ({
        ...prev,
        isLoading: false,
        isComplete: true,
        step: 'complete',
      }))

      return true
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Registration failed',
      }))
      return false
    }
  }, [firebaseUser, state.role, state.matchedRestaurant])

  // ============================================
  // HANDLER: Go back to role selection
  // ============================================
  const goBackToRoleSelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: 'role-selection',
      role: '',
      restaurantName: '',
      matchedRestaurant: null,
      restaurantSuggestions: [],
      error: '',
    }))
  }, [])

  // ============================================
  // HANDLER: Reset registration flow
  // ============================================
  const reset = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  // ============================================
  // HANDLER: Clear error message
  // ============================================
  const clearError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: '',
    }))
  }, [])

  return {
    // State
    ...state,
    // Handlers
    selectRole,
    confirmRole,
    searchRestaurants,
    selectRestaurant,
    completeRegistration,
    reset,
    goBackToRoleSelection,
    clearError,
  }
}
