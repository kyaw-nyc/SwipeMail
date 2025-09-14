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

      // Ensure profile has required structure
      return {
        userId,
        preferences: profile.preferences || {},
        emailsProcessed: profile.emailsProcessed || 0,
        lastUpdated: profile.lastUpdated || new Date().toISOString(),
        version: profile.version || '1.0',
        ...profile
      }
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
      preferences: {},
      emailsProcessed: 0,
      lastUpdated: new Date().toISOString(),
      version: '1.0'
    }
  }

  /**
   * Save user preference profile
   */
  async saveProfile(profile) {
    try {
      profile.lastUpdated = new Date().toISOString()
      const profilePath = this.getProfilePath(profile.userId)
      await fs.writeFile(profilePath, JSON.stringify(profile, null, 2))
      return true
    } catch (error) {
      console.error(`Failed to save profile for user ${profile.userId}:`, error)
      return false
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
   * Update user preferences based on swipe action
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

      // Update preferences for each token
      tokens.forEach(token => {
        if (!profile.preferences[token]) {
          profile.preferences[token] = { right: 0, left: 0 }
        }

        if (action === 'right' || action === 'interested') {
          profile.preferences[token].right += 1
        } else if (action === 'left' || action === 'not_interested') {
          profile.preferences[token].left += 1
        }
      })

      profile.emailsProcessed += 1

      await this.saveProfile(profile)

      console.log(`Updated preferences for user ${userId}:`, {
        tokens,
        action,
        totalEmails: profile.emailsProcessed
      })

      return profile.preferences
    } catch (error) {
      console.error('Failed to update preferences:', error)
      throw error
    }
  }

  /**
   * Calculate preference score for a token
   * @param {Object} tokenData - { right: number, left: number }
   * @returns {number} - Preference score (-1 to 1)
   */
  calculateTokenScore(tokenData) {
    const total = tokenData.right + tokenData.left
    if (total === 0) return 0

    // Simple scoring: (positive - negative) / total
    const score = (tokenData.right - tokenData.left) / total
    return Math.max(-1, Math.min(1, score))
  }

  /**
   * Calculate email preference score
   * @param {string} userId - User identifier
   * @param {Array} tokens - Email tokens
   * @returns {Promise<number>} - Email preference score (0 to 100)
   */
  async calculateEmailScore(userId, tokens) {
    if (!tokens || tokens.length === 0) return 50 // Neutral score

    try {
      const profile = await this.loadProfile(userId)
      let totalScore = 0
      let scoredTokens = 0

      tokens.forEach(token => {
        const tokenData = profile.preferences[token]
        if (tokenData && (tokenData.right + tokenData.left) > 0) {
          totalScore += this.calculateTokenScore(tokenData)
          scoredTokens += 1
        }
      })

      if (scoredTokens === 0) return 50 // Neutral for unknown tokens

      // Average score, then normalize to 0-100 range
      const averageScore = totalScore / scoredTokens
      return Math.round(((averageScore + 1) / 2) * 100) // Convert from [-1,1] to [0,100]
    } catch (error) {
      console.error('Failed to calculate email score:', error)
      return 50
    }
  }

  /**
   * Rank emails by user preference
   * @param {string} userId - User identifier
   * @param {Array} emails - Array of emails with tokens
   * @returns {Promise<Array>} - Sorted emails with preference scores
   */
  async rankEmails(userId, emails) {
    if (!emails || emails.length === 0) return []

    try {
      const emailsWithScores = await Promise.all(
        emails.map(async (email) => {
          const tokens = email._tokens || []
          const score = await this.calculateEmailScore(userId, tokens)
          return {
            ...email,
            _preferenceScore: score / 100, // Keep 0-1 for sorting but also store percentage
            _preferenceScorePercent: score,
            _tokens: tokens
          }
        })
      )

      // Sort by preference score (highest first)
      return emailsWithScores.sort((a, b) => b._preferenceScore - a._preferenceScore)
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
      const tokenScores = Object.entries(preferences).map(([token, data]) => ({
        token,
        score: this.calculateTokenScore(data),
        total: data.right + data.left,
        right: data.right,
        left: data.left
      }))

      // Sort by absolute score and confidence (total interactions)
      tokenScores.sort((a, b) => {
        const aConfidence = Math.abs(a.score) * Math.log(a.total + 1)
        const bConfidence = Math.abs(b.score) * Math.log(b.total + 1)
        return bConfidence - aConfidence
      })

      insights.topInterests = tokenScores
        .filter(t => t.score > 0.2)
        .slice(0, 10)
        .map(t => ({ token: t.token, score: t.score, interactions: t.total }))

      insights.topDislikes = tokenScores
        .filter(t => t.score < -0.2)
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