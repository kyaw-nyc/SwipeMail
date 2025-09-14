const fs = require('fs').promises
const path = require('path')
const cerebrasService = require('./cerebrasService')

class PreferenceService {
  constructor() {
    this.profilesDir = path.join(__dirname, '..', 'data', 'profiles')
    this.ensureProfilesDir()
  }

  async ensureProfilesDir() {
    try {
      await fs.mkdir(this.profilesDir, { recursive: true })
    } catch (error) {
      console.error('Failed to create profiles directory:', error)
    }
  }

  /**
   * Get user preference profile file path
   */
  getProfilePath(userId) {
    return path.join(this.profilesDir, `${userId}_preferences.json`)
  }

  /**
   * Load user preference profile
   * @param {string} userId - User identifier
   * @returns {Object} - User preference profile
   */
  async loadProfile(userId) {
    try {
      const profilePath = this.getProfilePath(userId)
      const data = await fs.readFile(profilePath, 'utf8')
      const profile = JSON.parse(data)

      // Ensure profile has required structure and migrate from v1.0 if needed
      const migratedProfile = {
        userId,
        preferences: profile.preferences || {},
        totalGood: profile.totalGood || 0,
        totalBad: profile.totalBad || 0,
        vocabulary: new Set(profile.vocabulary || []),
        emailsProcessed: profile.emailsProcessed || 0,
        lastUpdated: profile.lastUpdated || new Date().toISOString(),
        version: profile.version || '1.0',
        ...profile
      }

      // Migrate from v1.0 to v2.0 format if needed
      if (migratedProfile.version === '1.0') {
        console.log(`Migrating user ${userId} profile from v1.0 to v2.0`)
        migratedProfile.version = '2.0'

        // Initialize missing fields
        migratedProfile.totalGood = 0
        migratedProfile.totalBad = 0

        // Convert old preferences format { token: { right: X, left: Y } } to new format
        const newPreferences = {}
        Object.entries(migratedProfile.preferences).forEach(([token, data]) => {
          if (data && typeof data === 'object') {
            const rightCount = data.right || 0
            const leftCount = data.left || 0
            newPreferences[token] = { good: rightCount, bad: leftCount }
            migratedProfile.totalGood += rightCount
            migratedProfile.totalBad += leftCount
            migratedProfile.vocabulary.add(token)
          }
        })
        migratedProfile.preferences = newPreferences

        // Save the migrated profile
        const saved = await this.saveProfile(migratedProfile)
        if (!saved) {
          console.error(`Failed to save migrated profile for ${userId}`)
          // Return the migrated profile anyway to prevent data loss
        }
      }

      return migratedProfile
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Create new profile
        return this.createNewProfile(userId)
      }
      console.error(`Failed to load profile for user ${userId}:`, error)
      return this.createNewProfile(userId)
    }
  }

  /**
   * Create new user profile
   */
  createNewProfile(userId) {
    return {
      userId,
      preferences: {}, // token -> { good: count, bad: count }
      totalGood: 0,     // total tokens from all good emails
      totalBad: 0,      // total tokens from all bad emails
      vocabulary: new Set(), // all unique tokens seen
      emailsProcessed: 0,
      lastUpdated: new Date().toISOString(),
      version: '2.0'
    }
  }

  /**
   * Save user preference profile
   */
  async saveProfile(profile) {
    const profilePath = this.getProfilePath(profile.userId)
    const tempPath = profilePath + '.tmp'
    const lockPath = profilePath + '.lock'

    // Simple file-based locking mechanism
    let lockAcquired = false
    let retries = 0

    while (!lockAcquired && retries < 10) {
      try {
        // Try to create lock file (will fail if it exists)
        await fs.writeFile(lockPath, Date.now().toString(), { flag: 'wx' })
        lockAcquired = true
      } catch (error) {
        if (error.code === 'EEXIST') {
          // Lock exists, wait and retry
          await new Promise(resolve => setTimeout(resolve, 100))
          retries++
        } else {
          throw error
        }
      }
    }

    if (!lockAcquired) {
      console.error(`Failed to acquire lock for profile ${profile.userId}`)
      return false
    }

    try {
      profile.lastUpdated = new Date().toISOString()

      // Convert Set to Array for JSON serialization
      const profileToSave = {
        ...profile,
        vocabulary: Array.from(profile.vocabulary || [])
      }

      // Write to temp file first
      await fs.writeFile(tempPath, JSON.stringify(profileToSave, null, 2))

      // Atomic rename (prevents partial writes)
      await fs.rename(tempPath, profilePath)

      return true
    } catch (error) {
      console.error(`Failed to save profile for user ${profile.userId}:`, error)
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath)
      } catch (e) {
        // Ignore cleanup errors
      }
      return false
    } finally {
      // Always release lock
      try {
        await fs.unlink(lockPath)
      } catch (e) {
        // Ignore if lock already removed
      }
    }
  }

  /**
   * Process email and extract tokens
   * @param {string} userId - User identifier
   * @param {Object} email - Email object with subject and body
   * @returns {Promise<Array>} - Array of tokens
   */
  async processEmailTokens(userId, email) {
    try {
      const tokens = await cerebrasService.extractTokens(
        email.subject || '',
        email.body || email.snippet || ''
      )

      console.log(`Extracted tokens for email "${email.subject}":`, tokens)

      // Store tokens with email for later reference
      email._tokens = tokens

      return tokens
    } catch (error) {
      console.error('Failed to process email tokens:', error)
      return []
    }
  }

  /**
   * Update user preferences based on swipe action using Naive Bayes approach
   * @param {string} userId - User identifier
   * @param {Array} tokens - Email tokens from Cerebras
   * @param {string} action - 'right' (interested) or 'left' (not interested)
   */
  async updatePreferences(userId, tokens, action) {
    if (!tokens || tokens.length === 0) {
      console.log('No tokens to update preferences')
      return
    }

    try {
      const profile = await this.loadProfile(userId)

      const isGoodSwipe = action === 'right' || action === 'interested'

      // Update global token counts
      if (isGoodSwipe) {
        profile.totalGood += tokens.length
      } else {
        profile.totalBad += tokens.length
      }

      // Update per-token counts and vocabulary
      tokens.forEach(token => {
        if (!profile.preferences[token]) {
          profile.preferences[token] = { good: 0, bad: 0 }
        }

        if (isGoodSwipe) {
          profile.preferences[token].good += 1
        } else {
          profile.preferences[token].bad += 1
        }

        // Add to vocabulary
        profile.vocabulary.add(token)
      })

      profile.emailsProcessed += 1

      await this.saveProfile(profile)

      console.log(`Updated preferences for user ${userId}:`, {
        tokens: tokens.slice(0, 5), // Show only first 5 tokens to avoid spam
        tokenCount: tokens.length,
        action: isGoodSwipe ? 'good' : 'bad',
        totalGood: profile.totalGood,
        totalBad: profile.totalBad,
        vocabularySize: profile.vocabulary.size,
        totalEmails: profile.emailsProcessed
      })

      return profile.preferences
    } catch (error) {
      console.error('Failed to update preferences:', error)
      throw error
    }
  }

  /**
   * Calculate log-odds score for a token using Laplace smoothing
   * @param {Object} tokenData - { good: number, bad: number }
   * @param {number} totalGood - Total tokens from all good emails
   * @param {number} totalBad - Total tokens from all bad emails
   * @param {number} vocabularySize - Total unique tokens seen
   * @returns {number} - Log-odds score
   */
  calculateTokenLogOdds(tokenData, totalGood, totalBad, vocabularySize) {
    const alpha = 1 // Laplace smoothing parameter

    const goodCount = (tokenData && tokenData.good) || 0
    const badCount = (tokenData && tokenData.bad) || 0

    // Smoothed probabilities using Laplace smoothing
    const pGood = (goodCount + alpha) / (totalGood + alpha * vocabularySize)
    const pBad = (badCount + alpha) / (totalBad + alpha * vocabularySize)

    // Log-odds: log(P(token|good) / P(token|bad))
    return Math.log(pGood / pBad)
  }

  /**
   * Calculate email preference score using Naive Bayes with log-odds
   * @param {string} userId - User identifier
   * @param {Array} tokens - Email tokens
   * @param {Object} email - Email object (not used in this scoring method)
   * @returns {Promise<number>} - Email preference score (0 to 100)
   */
  async calculateEmailScore(userId, tokens, email = null) {
    if (!tokens || tokens.length === 0) return 50 // Neutral score for no tokens

    try {
      const profile = await this.loadProfile(userId)

      // Handle case where user has no preferences yet
      if (profile.totalGood === 0 && profile.totalBad === 0) {
        return 50 // Neutral score
      }

      const vocabularySize = profile.vocabulary.size
      let rawScore = 0

      // Sum log-odds scores for all tokens in the email
      tokens.forEach(token => {
        const tokenData = profile.preferences[token]
        const logOdds = this.calculateTokenLogOdds(
          tokenData,
          profile.totalGood,
          profile.totalBad,
          vocabularySize
        )
        rawScore += logOdds
      })

      // Convert to probability using sigmoid function
      const probability = 1 / (1 + Math.exp(-rawScore))

      // Convert to 0-100 scale
      const finalScore = Math.round(probability * 100)

      return Math.max(0, Math.min(100, finalScore))
    } catch (error) {
      console.error('Failed to calculate email score:', error)
      return 50
    }
  }

  /**
   * Rank emails by user preference
   * @param {string} userId - User identifier
   * @param {Array} emails - Array of emails with tokens
   * @param {string} streamType - 'smart' for ML ranking, 'unread' for recency only
   * @returns {Promise<Array>} - Sorted emails with preference scores
   */
  async rankEmails(userId, emails, streamType = 'smart') {
    if (!emails || emails.length === 0) return []

    try {
      const emailsWithScores = await Promise.all(
        emails.map(async (email) => {
          const tokens = email._tokens || []
          const score = await this.calculateEmailScore(userId, tokens, email)
          return {
            ...email,
            _preferenceScore: score / 100, // Normalize back to 0-1 for internal use
            _preferenceScorePercent: score, // Keep as 0-100 for display
            _tokens: tokens
          }
        })
      )

      // Sort based on stream type
      if (streamType === 'unread') {
        // Unread stream: sort by recency only (most recent first)
        return emailsWithScores.sort((a, b) => {
          const aDate = a.internalDate ? parseInt(a.internalDate) : 0
          const bDate = b.internalDate ? parseInt(b.internalDate) : 0
          return bDate - aDate
        })
      } else {
        // Smart stream: sort by ML preference score (highest first), then by recency for tie-breaking
        return emailsWithScores.sort((a, b) => {
          if (Math.abs(a._preferenceScore - b._preferenceScore) > 0.01) { // Avoid floating point comparison issues
            return b._preferenceScore - a._preferenceScore // Higher score first
          }
          // Tie-breaker: more recent first
          const aDate = a.internalDate ? parseInt(a.internalDate) : 0
          const bDate = b.internalDate ? parseInt(b.internalDate) : 0
          return bDate - aDate
        })
      }
    } catch (error) {
      console.error('Failed to rank emails:', error)
      return emails
    }
  }

  /**
   * Get user preference insights
   */
  async getPreferenceInsights(userId) {
    try {
      const profile = await this.loadProfile(userId)
      const insights = {
        totalEmails: profile.emailsProcessed,
        topInterests: [],
        topDislikes: [],
        profileStrength: 0
      }

      const preferences = profile.preferences
      const vocabularySize = profile.vocabulary.size

      const tokenScores = Object.entries(preferences).map(([token, data]) => {
        const logOdds = this.calculateTokenLogOdds(data, profile.totalGood, profile.totalBad, vocabularySize)
        return {
          token,
          score: logOdds, // Log-odds score
          total: data.good + data.bad,
          good: data.good,
          bad: data.bad
        }
      })

      // Sort by absolute score and confidence (total interactions)
      tokenScores.sort((a, b) => {
        const aConfidence = Math.abs(a.score) * Math.log(a.total + 1)
        const bConfidence = Math.abs(b.score) * Math.log(b.total + 1)
        return bConfidence - aConfidence
      })

      insights.topInterests = tokenScores
        .filter(t => t.score > 0.5) // Positive log-odds indicate preference for "good"
        .slice(0, 10)
        .map(t => ({ token: t.token, score: t.score, interactions: t.total }))

      insights.topDislikes = tokenScores
        .filter(t => t.score < -0.5) // Negative log-odds indicate preference for "bad"
        .slice(0, 10)
        .map(t => ({ token: t.token, score: t.score, interactions: t.total }))

      // Calculate profile strength (0-100) based on total interactions
      const totalInteractions = tokenScores.reduce((sum, t) => sum + t.total, 0)
      insights.profileStrength = Math.min(100, Math.floor(totalInteractions / 2))

      return insights
    } catch (error) {
      console.error('Failed to get preference insights:', error)
      return {
        totalEmails: 0,
        topInterests: [],
        topDislikes: [],
        profileStrength: 0
      }
    }
  }

  /**
   * Reset user preferences
   */
  async resetProfile(userId) {
    try {
      const newProfile = this.createNewProfile(userId)
      await this.saveProfile(newProfile)
      return true
    } catch (error) {
      console.error('Failed to reset profile:', error)
      return false
    }
  }
}

module.exports = new PreferenceService()