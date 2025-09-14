/**
 * Cerebras API Service for Semantic Email Analysis
 * Provides functions to analyze emails using Cerebras AI models
 */

class CerebrasAPI {
  constructor() {
    this.apiKey = import.meta.env.VITE_CEREBRAS_API_KEY
    this.baseUrl = import.meta.env.VITE_CEREBRAS_API_URL || 'https://api.cerebras.ai/v1'
    this.model = 'llama-3.3-70b' // Default model for analysis

    // Debug logging
    console.log('Cerebras API initialized:', {
      hasApiKey: !!this.apiKey,
      apiKeyPrefix: this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'none',
      baseUrl: this.baseUrl,
      model: this.model
    })
  }

  /**
   * Make a request to Cerebras API
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request payload
   * @returns {Promise<Object>} API response
   */
  async makeRequest(endpoint, data) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'SwipeMail/1.0',
        },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        throw new Error(`Cerebras API error: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Cerebras API request failed:', error)
      throw error
    }
  }

  /**
   * Analyze email sentiment and importance
   * @param {Object} email - Email object with subject, from, snippet
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeEmail(email) {
    const prompt = `Analyze this email and determine if it's from an individual person or an organization:

Subject: ${email.subject}
From: ${email.from}
Content: ${email.snippet}

Analyze the sender and determine:

1. SENDER TYPE: Is this from an "individual" (real person) or "organization" (company, service, automated system)?

Guidelines:
- "individual" = Personal emails from real people (friends, family, colleagues, personal contacts)
- "organization" = Companies, services, newsletters, automated systems, businesses, institutions

Return ONLY a JSON object with this exact key: senderType

Example formats:
{"senderType": "individual"}
{"senderType": "organization"}`

    const data = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    }

    const response = await this.makeRequest('/chat/completions', data)

    try {
      // Parse the JSON response from the model
      const analysisText = response.choices[0].message.content
      return JSON.parse(analysisText)
    } catch (parseError) {
      console.warn('Failed to parse Cerebras response as JSON:', parseError)
      // Return structured fallback
      return {
        senderType: 'organization' // Default to organization if analysis fails
      }
    }
  }

  /**
   * Batch analyze multiple emails
   * @param {Array} emails - Array of email objects
   * @returns {Promise<Array>} Array of analysis results
   */
  async batchAnalyzeEmails(emails) {
    const analyses = []

    // Process emails in batches to avoid rate limits
    for (const email of emails) {
      try {
        const analysis = await this.analyzeEmail(email)
        analyses.push({
          emailId: email.id,
          ...analysis
        })
      } catch (error) {
        console.error(`Failed to analyze email ${email.id}:`, error)
        // Add fallback analysis
        analyses.push({
          emailId: email.id,
          senderType: 'organization'
        })
      }
    }

    return analyses
  }

  /**
   * Generate smart email categorization suggestions
   * @param {Array} emails - Array of email objects
   * @returns {Promise<Object>} Categorization suggestions
   */
  async suggestCategories(emails) {
    const emailSummary = emails.map(email =>
      `${email.from}: ${email.subject}`
    ).join('\n')

    const prompt = `Based on these emails, suggest optimal categories for email organization:

${emailSummary}

Suggest 5-8 categories that would best organize these emails. Return as JSON array of category names.`

    const data = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.5
    }

    try {
      const response = await this.makeRequest('/chat/completions', data)
      const categoriesText = response.choices[0].message.content
      return JSON.parse(categoriesText)
    } catch (error) {
      console.error('Failed to generate category suggestions:', error)
      return ['Work', 'Personal', 'Marketing', 'Social', 'News', 'Other']
    }
  }

  /**
   * Extract event details from an email using Cerebras
   * Returns JSON: { has_event, event_title, start_time, end_time, timezone, location, confidence, brief_reason }
   */
  async extractEventFromEmail(email) {
    const buildPrompt = ({ subject = '', from = '', body = '' }) => `You are an assistant that extracts event information from email text.
Return ONLY strict JSON with this schema:
{
  "has_event": boolean,
  "event_title": string | null,
  "start_time": string | null,
  "end_time": string | null,
  "timezone": string | null,
  "location": string | null,
  "confidence": number,
  "brief_reason": string
}

Rules:
- If no event is present, set has_event=false and others to null except confidence and brief_reason.
- If only a date is known (no time), provide ISO date and set missing parts to null.
- If a range is implied but only start is known, set end_time to null.
- Do not include any extra text before or after the JSON.

Email context:
From: ${from}
Subject: ${subject}
Body:
${(body || '').slice(0, 4000)}
`

    const data = {
      model: this.model,
      messages: [
        { role: 'system', content: 'You extract event data from emails and reply in strict JSON.' },
        { role: 'user', content: buildPrompt(email) },
      ],
      temperature: 0,
      max_tokens: 500,
    }

    const res = await this.makeRequest('/chat/completions', data)
    const content = res?.choices?.[0]?.message?.content || ''
    // Attempt to parse JSON from content
    const tryParse = (text) => {
      try { return JSON.parse(text) } catch {}
      const block = text.match(/```(?:json)?\n([\s\S]*?)\n```/i)
      if (block?.[1]) { try { return JSON.parse(block[1]) } catch {} }
      const s = text.indexOf('{'), e = text.lastIndexOf('}')
      if (s !== -1 && e !== -1 && e > s) { try { return JSON.parse(text.slice(s, e + 1)) } catch {} }
      return null
    }
    const parsed = tryParse(content)
    if (!parsed || typeof parsed.has_event !== 'boolean') {
      throw new Error('Failed to parse Cerebras event extraction response')
    }
    return parsed
  }
}

// Export singleton instance
const cerebrasApi = new CerebrasAPI()
export default cerebrasApi
