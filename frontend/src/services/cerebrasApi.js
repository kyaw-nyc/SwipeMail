/**
 * Cerebras API Service for Semantic Email Analysis
 * Provides functions to analyze emails using Cerebras AI models
 */

class CerebrasAPI {
  constructor() {
    this.apiKey = import.meta.env.VITE_CEREBRAS_API_KEY
    this.baseUrl = import.meta.env.VITE_CEREBRAS_API_URL || 'https://api.cerebras.ai/v1'
    this.model = 'llama-3.3-70b' // Using the latest Llama model for better analysis

    // Simple client-side rate limiting to avoid 429s
    this.maxConcurrent = 2
    this.inflight = 0
    this.queue = []

    // Debug logging
    console.log('Cerebras API initialized:', {
      hasApiKey: !!this.apiKey,
      apiKeyPrefix: this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'none',
      baseUrl: this.baseUrl,
      model: this.model
    })
  }

  // Acquire a slot for making a request
  async acquireSlot() {
    if (this.inflight < this.maxConcurrent) {
      this.inflight += 1
      return
    }
    await new Promise(resolve => this.queue.push(resolve))
    this.inflight += 1
  }

  // Release a slot and schedule next
  releaseSlot() {
    this.inflight = Math.max(0, this.inflight - 1)
    const next = this.queue.shift()
    if (next) next()
  }

  /**
   * Make a request to Cerebras API
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request payload
   * @returns {Promise<Object>} API response
   */
  async makeRequest(endpoint, data) {
    await this.acquireSlot()
    try {
      const url = `${this.baseUrl}${endpoint}`
      const maxRetries = 4
      let attempt = 0
      let lastError

      while (attempt <= maxRetries) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'User-Agent': 'SwipeMail/1.0',
            },
            body: JSON.stringify(data)
          })

          if (response.ok) {
            return await response.json()
          }

          // Retry on 429 or 5xx
          const status = response.status
          const text = await response.text().catch(() => '')
          const retryAfter = response.headers?.get?.('retry-after')
          const retryAfterMs = retryAfter ? (isNaN(Number(retryAfter)) ? 0 : Number(retryAfter) * 1000) : 0

          if (status === 429 || (status >= 500 && status < 600)) {
            if (attempt < maxRetries) {
              const backoff = retryAfterMs || Math.min(16000, 1000 * Math.pow(2, attempt))
              const jitter = Math.floor(Math.random() * 200)
              console.warn(`Cerebras API ${status}. Retrying in ${backoff + jitter}ms (attempt ${attempt + 1}/${maxRetries})`)
              await new Promise(r => setTimeout(r, backoff + jitter))
              attempt += 1
              continue
            }
          }

          // Non-retriable or retries exhausted
          const err = new Error(text || `Cerebras API error: ${status} ${response.statusText}`)
          err.status = status
          throw err
        } catch (err) {
          lastError = err
          // Network errors: backoff and retry
          if (!err.status && attempt < maxRetries) {
            const backoff = Math.min(16000, 1000 * Math.pow(2, attempt))
            const jitter = Math.floor(Math.random() * 200)
            console.warn(`Cerebras API network error. Retrying in ${backoff + jitter}ms (attempt ${attempt + 1}/${maxRetries})`)
            await new Promise(r => setTimeout(r, backoff + jitter))
            attempt += 1
            continue
          }
          throw err
        }
      }

      throw lastError || new Error('Cerebras API request failed')
    } finally {
      this.releaseSlot()
    }
  }

  /**
   * Analyze email with advanced categorization and intelligence
   * @param {Object} email - Email object with subject, from, snippet
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeEmail(email) {
    const prompt = `You are an expert email analyst. Analyze this email comprehensively and provide detailed categorization.

EMAIL TO ANALYZE:
Subject: ${email.subject}
From: ${email.from}
Content: ${email.snippet || email.body || ''}

ANALYSIS REQUIRED:

1. **SENDER TYPE**: Classify sender as:
   - "individual": Personal emails from real people (friends, family, colleagues, personal contacts, recruiters writing personally)
   - "organization": Companies, services, newsletters, automated systems, businesses, institutions, no-reply addresses

2. **CONTENT CATEGORY**: Primary category:
   - "work": Job-related, professional, work communications, career opportunities
   - "personal": Personal relationships, social communications, family, friends
   - "finance": Banking, investments, financial services, money-related
   - "commerce": Shopping, purchases, e-commerce, retail, deals, promotions
   - "education": Learning, courses, training, academic content
   - "travel": Travel bookings, confirmations, travel-related information
   - "health": Healthcare, medical, fitness, wellness
   - "news": News updates, current events, journalism
   - "social": Social media notifications, community updates
   - "entertainment": Entertainment content, media, games, hobbies
   - "newsletters": Regular informational updates, subscriptions
   - "notifications": System notifications, alerts, confirmations
   - "spam": Clearly promotional/spam content
   - "other": Doesn't fit other categories

3. **PRIORITY LEVEL**:
   - "high": Urgent, time-sensitive, important personal/work communications
   - "medium": Moderately important, should be reviewed soon
   - "low": Informational, can be processed later

4. **ENGAGEMENT LIKELIHOOD**: Based on content, how likely is user engagement?
   - 0.0-1.0 score

5. **KEY TOPICS**: Extract 2-4 key topics/tags from content (single words)

EXAMPLES:
- Newsletter from company → {"senderType": "organization", "contentCategory": "newsletters", "priority": "low", "engagement": 0.3, "topics": ["technology", "updates"]}
- Email from colleague → {"senderType": "individual", "contentCategory": "work", "priority": "high", "engagement": 0.8, "topics": ["project", "deadline"]}
- Shopping confirmation → {"senderType": "organization", "contentCategory": "commerce", "priority": "medium", "engagement": 0.6, "topics": ["purchase", "confirmation"]}

Return ONLY a JSON object with these exact keys: senderType, contentCategory, priority, engagement, topics

FORMAT: {"senderType": "...", "contentCategory": "...", "priority": "...", "engagement": 0.0, "topics": ["..."]}`

    const data = {
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert email analyst. Always return valid JSON with the exact schema requested.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.2 // Lower temperature for more consistent categorization
    }

    try {
      const response = await this.makeRequest('/chat/completions', data)
      const analysisText = response.choices[0].message.content

      // Enhanced JSON parsing with fallback
      const tryParse = (text) => {
        try { return JSON.parse(text) } catch {}
        // Try extracting from markdown code blocks
        const block = text.match(/```(?:json)?\n([\s\S]*?)\n```/i)
        if (block?.[1]) { try { return JSON.parse(block[1]) } catch {} }
        // Try finding JSON object boundaries
        const s = text.indexOf('{'), e = text.lastIndexOf('}')
        if (s !== -1 && e !== -1 && e > s) { try { return JSON.parse(text.slice(s, e + 1)) } catch {} }
        return null
      }

      const parsed = tryParse(analysisText)

      // Validate the response structure
      if (parsed && parsed.senderType && parsed.contentCategory) {
        return {
          senderType: parsed.senderType,
          contentCategory: parsed.contentCategory,
          priority: parsed.priority || 'medium',
          engagement: Math.max(0, Math.min(1, parsed.engagement || 0.5)),
          topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 4) : ['email']
        }
      } else {
        throw new Error('Invalid response structure')
      }
    } catch (parseError) {
      console.warn('Failed to parse advanced Cerebras analysis:', parseError)

      // Intelligent fallback based on email content
      const subject = (email.subject || '').toLowerCase()
      const from = (email.from || '').toLowerCase()
      const content = (email.snippet || email.body || '').toLowerCase()

      // Simple heuristics for fallback
      let senderType = 'organization'
      if (from.includes('@gmail.com') || from.includes('@yahoo.com') || from.includes('@outlook.com')) {
        senderType = 'individual'
      }

      let contentCategory = 'other'
      if (subject.includes('work') || subject.includes('job') || subject.includes('meeting')) contentCategory = 'work'
      else if (subject.includes('order') || subject.includes('purchase') || subject.includes('buy')) contentCategory = 'commerce'
      else if (subject.includes('news') || subject.includes('update')) contentCategory = 'newsletters'
      else if (subject.includes('bank') || subject.includes('payment') || subject.includes('invoice')) contentCategory = 'finance'

      return {
        senderType,
        contentCategory,
        priority: 'medium',
        engagement: 0.5,
        topics: ['email']
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
   * Check if an email matches a custom folder
   * @param {Object} email - Email object with subject, from, body/snippet
   * @param {Object} folder - Folder object with name and description
   * @returns {Promise<Object>} Match result with confidence score
   */
  async matchEmailToFolder(email, folder) {
    const prompt = `Analyze if this email belongs in the "${folder.name}" folder.

IMPORTANT: Emails can belong to multiple folders simultaneously. An email about "work travel" could belong in both "Work" and "Travel" folders. Consider if this email fits the specific folder being evaluated, regardless of whether it might also fit other folders.

Folder Description: ${folder.description}

Email Details:
From: ${email.from}
Subject: ${email.subject}
Content: ${email.body || email.snippet || ''}

Based on the folder's purpose and the email content, determine if this email belongs in this specific folder. Remember that emails can have multiple relevant categories.

Return ONLY a JSON object with these keys:
- matches: boolean (true if email belongs in folder, false otherwise)
- confidence: number (0-1, how confident you are)
- reason: string (brief explanation why it matches or doesn't match)

Example responses:
{"matches": true, "confidence": 0.95, "reason": "Work-related email from colleague about project deadline"}
{"matches": false, "confidence": 0.8, "reason": "Personal email, not related to work topics"}
{"matches": true, "confidence": 0.85, "reason": "Travel booking confirmation - fits travel folder even though it's also work-related"}`

    const data = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 200,
      temperature: 0.2
    }

    try {
      const response = await this.makeRequest('/chat/completions', data)
      const resultText = response.choices[0].message.content

      // Helper function to parse JSON from various formats
      const tryParse = (text) => {
        try { return JSON.parse(text) } catch {}
        // Try extracting from markdown code blocks
        const block = text.match(/```(?:json)?\\n([\\s\\S]*?)\\n```/i)
        if (block?.[1]) { try { return JSON.parse(block[1]) } catch {} }
        // Try finding JSON object boundaries
        const s = text.indexOf('{'), e = text.lastIndexOf('}')
        if (s !== -1 && e !== -1 && e > s) { try { return JSON.parse(text.slice(s, e + 1)) } catch {} }
        return null
      }

      const parsed = tryParse(resultText)
      if (!parsed || typeof parsed.matches !== 'boolean') {
        throw new Error('Failed to parse folder matching response')
      }
      return parsed
    } catch (error) {
      console.error('Failed to match email to folder:', error)
      return {
        matches: false,
        confidence: 0,
        reason: 'Analysis failed'
      }
    }
  }

  /**
   * Find the best matching custom folder for an email
   * @param {Object} email - Email object
   * @param {Array} customFolders - Array of custom folder objects
   * @returns {Promise<Object|null>} Best matching folder or null
   */
  async findBestFolder(email, customFolders) {
    if (!customFolders || customFolders.length === 0) {
      return null
    }

    const matches = []

    // Check each folder
    for (const folder of customFolders) {
      try {
        const result = await this.matchEmailToFolder(email, folder)
        if (result.matches && result.confidence > 0.7) {
          matches.push({
            folder,
            ...result
          })
        }
      } catch (error) {
        console.error(`Failed to check folder ${folder.name}:`, error)
      }
    }

    // Return the best match (highest confidence)
    if (matches.length > 0) {
      matches.sort((a, b) => b.confidence - a.confidence)
      return matches[0]
    }

    return null
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
