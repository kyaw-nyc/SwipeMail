// Machine Learning Service for SwipeMail
// Handles communication with the ML backend APIs

const API_BASE_URL = 'http://localhost:3001'
const DEFAULT_USER_ID = 'demo-user' // For demo purposes

class MLService {
  constructor() {
    this.userId = DEFAULT_USER_ID
    this.cache = new Map()
    this.config = null
  }

  /**
   * Set user ID for all ML operations
   */
  setUserId(userId) {
    this.userId = userId || DEFAULT_USER_ID
    console.log(`ML Service: Using user ID: ${this.userId}`)
  }

  /**
   * Get ML configuration from backend
   */
  async getConfig() {
    if (this.config) return this.config

    try {
      const response = await fetch(`${API_BASE_URL}/api/config`)
      const config = await response.json()
      this.config = config
      return config
    } catch (error) {
      console.error('Failed to get ML config:', error)
      return null
    }
  }

  /**
   * Check if ML features are enabled
   */
  async isMLEnabled() {
    // For demo purposes, always enable ML features
    // In production, this would check the backend config
    return true
  }

  /**
   * Extract tokens from email content
   */
  async extractTokens(email) {
    try {
      const cacheKey = `tokens_${email.id}`
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)
      }

      const response = await fetch(`${API_BASE_URL}/api/ml/extract-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: email.subject || '',
          body: email.body || email.snippet || ''
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      const tokens = result.success ? result.tokens : []

      // Cache the result
      this.cache.set(cacheKey, tokens)

      console.log(`Extracted tokens for "${email.subject}":`, tokens)
      return tokens
    } catch (error) {
      console.error('Token extraction failed:', error)
      return []
    }
  }

  /**
   * Update user preferences based on swipe action
   */
  async updatePreferences(tokens, action) {
    try {
      if (!tokens || tokens.length === 0) {
        console.log('No tokens to update preferences with')
        return
      }

      // ML learning is always enabled in demo mode

      // Convert action to backend format
      const backendAction = action === 'interested' ? 'right' :
                          action === 'not_interested' ? 'left' : action

      const response = await fetch(`${API_BASE_URL}/api/ml/update-preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: this.userId,
          tokens,
          action: backendAction
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      console.log(`Updated preferences:`, {
        tokens,
        action: backendAction,
        success: result.success
      })

      return result.preferences
    } catch (error) {
      console.error('Preference update failed:', error)
      throw error
    }
  }

  /**
   * Calculate preference score for an email
   */
  async calculateEmailScore(tokens) {
    try {
      if (!tokens || tokens.length === 0) return 0.5

      const response = await fetch(`${API_BASE_URL}/api/ml/score-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: this.userId,
          tokens
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      return result.success ? result.score : 0.5
    } catch (error) {
      console.error('Email scoring failed:', error)
      return 0.5
    }
  }

  /**
   * Rank emails by user preference
   */
  async rankEmails(emails, streamType = 'smart') {
    try {
      // ML ranking is always enabled in demo mode

      if (!emails || emails.length === 0) return []

      // First, extract tokens for emails that don't have them
      const emailsWithTokens = await Promise.all(
        emails.map(async (email) => {
          if (!email._tokens) {
            email._tokens = await this.extractTokens(email)
          }
          return email
        })
      )

      const response = await fetch(`${API_BASE_URL}/api/ml/rank-emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: this.userId,
          emails: emailsWithTokens,
          streamType: streamType
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      const rankedEmails = result.success ? result.emails : emails

      console.log(`Ranked ${rankedEmails.length} emails by ${streamType === 'smart' ? 'ML preferences + recency' : 'recency only'}`)
      return rankedEmails
    } catch (error) {
      console.error('Email ranking failed:', error)
      return emails
    }
  }

  /**
   * Process email swipe with ML feedback
   */
  async processEmailSwipe(email, action) {
    try {
      // Extract tokens if not already present
      if (!email._tokens) {
        email._tokens = await this.extractTokens(email)
      }

      // Update preferences based on the action
      await this.updatePreferences(email._tokens, action)

      console.log(`Processed ML feedback for email swipe:`, {
        subject: email.subject,
        tokens: email._tokens,
        action,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Failed to process ML feedback:', error)
      // Don't throw - ML should not block the main swipe functionality
    }
  }

  /**
   * Get user preference profile and insights
   */
  async getUserProfile() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ml/profile/${this.userId}`)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      return result.success ? result : null
    } catch (error) {
      console.error('Failed to get user profile:', error)
      return null
    }
  }

  /**
   * Test ML service connection
   */
  async testConnection() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ml/test`)
      const result = await response.json()
      console.log('ML Service test result:', result)
      return result
    } catch (error) {
      console.error('ML Service test failed:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear()
    console.log('ML Service cache cleared')
  }

  /**
   * Reset user preferences
   */
  async resetProfile() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ml/profile/${this.userId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      this.clearCache() // Clear cache after reset

      console.log('User ML profile reset:', result)
      return result.success
    } catch (error) {
      console.error('Failed to reset user profile:', error)
      return false
    }
  }
}

// Export singleton instance
export default new MLService()