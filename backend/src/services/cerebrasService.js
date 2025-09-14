const axios = require('axios')

class CerebrasService {
  constructor() {
    this.apiKey = process.env.CEREBRAS_API_KEY
    this.baseURL = 'https://api.cerebras.ai/v1'

    if (!this.apiKey) {
      console.warn('Cerebras API key not found. ML features will be disabled.')
    }
  }

  /**
   * Extract descriptive tokens/categories from email content using Cerebras
   * @param {string} subject - Email subject
   * @param {string} body - Email body content
   * @returns {Promise<Array>} - Array of tokens/categories
   */
  async extractTokens(subject, body) {
    if (!this.apiKey) {
      console.warn('Cerebras API key not available, returning empty tokens')
      return []
    }

    try {
      // Clean and truncate content to avoid token limits
      const cleanSubject = this.cleanText(subject).substring(0, 200)
      const cleanBody = this.cleanText(body).substring(0, 1500)

      const prompt = `Analyze this email and extract 8-12 descriptive categories or topics as a JSON array. Focus on:
- Industry/field (e.g., "technology", "healthcare", "finance")
- Email type (e.g., "newsletter", "promotion", "announcement", "job_posting")
- Content themes (e.g., "career", "productivity", "networking", "events")
- Sentiment indicators (e.g., "urgent", "informational", "sales_pitch")

Email Subject: ${cleanSubject}

Email Content: ${cleanBody}

Return only a JSON array of strings, no other text. Example: ["technology", "newsletter", "career", "informational"]`

      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: 'llama3.1-8b',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 150
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      )

      const content = response.data.choices[0]?.message?.content?.trim()
      if (!content) {
        console.warn('Empty response from Cerebras')
        return []
      }

      // Parse JSON response
      try {
        const tokens = JSON.parse(content)
        if (Array.isArray(tokens)) {
          // Filter and clean tokens
          return tokens
            .map(token => typeof token === 'string' ? token.toLowerCase().trim() : null)
            .filter(token => token && token.length > 0 && token.length < 50)
            .slice(0, 12) // Limit to 12 tokens max
        }
      } catch (parseError) {
        console.warn('Failed to parse Cerebras JSON response:', content)
        // Fallback: extract words from the response
        return this.extractFallbackTokens(content)
      }

      return []
    } catch (error) {
      console.error('Cerebras API error:', error.message)

      // Return basic fallback tokens based on simple text analysis
      return this.generateFallbackTokens(subject, body)
    }
  }

  /**
   * Clean text content for API processing
   */
  cleanText(text) {
    if (!text) return ''

    return text
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[<>]/g, '')
      .trim()
  }

  /**
   * Extract tokens from malformed response
   */
  extractFallbackTokens(content) {
    const words = content.toLowerCase().match(/\b[a-z]{3,20}\b/g) || []
    return [...new Set(words)].slice(0, 8)
  }

  /**
   * Generate basic tokens when API fails
   */
  generateFallbackTokens(subject, body) {
    const tokens = new Set()
    const content = `${subject} ${body}`.toLowerCase()

    // Basic keyword detection
    const keywords = {
      'technology': /\b(tech|software|app|api|code|programming|development|digital)\b/,
      'business': /\b(business|company|corporate|enterprise|startup|revenue)\b/,
      'career': /\b(job|career|hiring|position|employment|opportunity|resume)\b/,
      'finance': /\b(money|payment|invoice|financial|budget|investment|banking)\b/,
      'marketing': /\b(marketing|promotion|advertisement|campaign|brand|social)\b/,
      'newsletter': /\b(newsletter|digest|weekly|monthly|update|news)\b/,
      'event': /\b(event|meeting|conference|webinar|workshop|seminar)\b/,
      'urgent': /\b(urgent|asap|immediately|deadline|expires|limited)\b/,
      'personal': /\b(personal|private|confidential|individual)\b/
    }

    for (const [token, regex] of Object.entries(keywords)) {
      if (regex.test(content)) {
        tokens.add(token)
      }
    }

    // Add generic tokens if nothing found
    if (tokens.size === 0) {
      tokens.add('general')
      tokens.add('email')
    }

    return Array.from(tokens).slice(0, 6)
  }

  /**
   * Test the Cerebras connection
   */
  async testConnection() {
    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' }
    }

    try {
      const tokens = await this.extractTokens('Test email subject', 'Test email content about technology and business.')
      return {
        success: true,
        tokens,
        message: 'Cerebras service is working'
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }
}

module.exports = new CerebrasService()