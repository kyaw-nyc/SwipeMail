const express = require('express')
const cors = require('cors')
require('dotenv').config()

// Import ML services
const cerebrasService = require('./src/services/cerebrasService')
const preferenceService = require('./src/services/preferenceService')

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json({ limit: '50mb' })) // Increase limit for email content
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// Sample email data for mock mode
const mockEmails = [
  {
    id: 'mock-1',
    subject: 'Welcome to SwipeMail!',
    from: 'SwipeMail Team <team@swipemail.com>',
    snippet: 'Thank you for trying SwipeMail! This is a sample email to help you test the interface. You can mark this as read or apply labels using the buttons below.',
    labelIds: ['INBOX', 'UNREAD']
  },
  {
    id: 'mock-2',
    subject: 'Your GitHub notification digest',
    from: 'GitHub <notifications@github.com>',
    snippet: 'You have 3 new pull requests awaiting your review. Check out the latest updates from your repositories.',
    labelIds: ['INBOX', 'UNREAD']
  },
  {
    id: 'mock-3',
    subject: 'Weekly Newsletter - AI & Machine Learning',
    from: 'AI Weekly <newsletter@aiweekly.co>',
    snippet: 'This week: OpenAI announces GPT-5, new computer vision breakthroughs, and the latest in autonomous vehicles. Plus 10 more stories.',
    labelIds: ['INBOX', 'UNREAD', 'CATEGORY_UPDATES']
  },
  {
    id: 'mock-4',
    subject: 'Your package has been delivered!',
    from: 'Amazon <shipment-tracking@amazon.com>',
    snippet: 'Great news! Your package has been delivered and is waiting for you. Was this delivery as expected?',
    labelIds: ['INBOX', 'UNREAD', 'CATEGORY_PURCHASES']
  },
  {
    id: 'mock-5',
    subject: 'Meeting reminder: Team Standup',
    from: 'Calendar <calendar-notification@google.com>',
    snippet: 'This is a reminder that Team Standup is starting in 15 minutes. Join the meeting or let your team know if you cannot attend.',
    labelIds: ['INBOX', 'UNREAD', 'IMPORTANT']
  },
  {
    id: 'mock-6',
    subject: 'Invoice from DigitalOcean',
    from: 'DigitalOcean <billing@digitalocean.com>',
    snippet: 'Your DigitalOcean invoice for December 2024 is now available. Total amount due: $47.32. View and download your invoice.',
    labelIds: ['INBOX', 'UNREAD', 'CATEGORY_PURCHASES']
  }
]

// Routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'SwipeMail Backend API'
  })
})

// Mock email endpoint for testing without Gmail API
app.get('/api/mock', (req, res) => {
  res.json(mockEmails)
})

// TODO: Add authentication endpoints
// POST /auth/google - Handle Google OAuth token exchange
// POST /auth/refresh - Refresh access tokens
// POST /auth/logout - Handle logout

// TODO: Add Gmail proxy endpoints (for future server-side implementation)
// GET /api/emails - Fetch emails from Gmail API server-side
// POST /api/emails/:id/read - Mark email as read
// POST /api/emails/:id/label - Apply label to email
// GET /api/labels - Get available Gmail labels

// TODO: Add user management endpoints
// GET /api/user/profile - Get user profile
// PUT /api/user/settings - Update user settings
// GET /api/user/stats - Get email statistics

// AI/ML endpoints
// Extract tokens from email content
app.post('/api/ml/extract-tokens', async (req, res) => {
  try {
    const { subject, body } = req.body

    if (!subject && !body) {
      return res.status(400).json({ error: 'Subject or body is required' })
    }

    const tokens = await cerebrasService.extractTokens(subject || '', body || '')

    res.json({
      success: true,
      tokens,
      metadata: {
        subject: subject || '',
        bodyLength: body ? body.length : 0,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Token extraction error:', error)
    res.status(500).json({
      error: 'Failed to extract tokens',
      message: error.message
    })
  }
})

// Update user preferences based on swipe
app.post('/api/ml/update-preferences', async (req, res) => {
  try {
    const { userId, tokens, action } = req.body

    if (!userId || !tokens || !action) {
      return res.status(400).json({
        error: 'Missing required fields: userId, tokens, action'
      })
    }

    if (!Array.isArray(tokens)) {
      return res.status(400).json({ error: 'Tokens must be an array' })
    }

    if (!['left', 'right', 'interested', 'not_interested'].includes(action)) {
      return res.status(400).json({
        error: 'Action must be left, right, interested, or not_interested'
      })
    }

    const preferences = await preferenceService.updatePreferences(userId, tokens, action)

    res.json({
      success: true,
      preferences,
      message: `Updated preferences for ${tokens.length} tokens`
    })
  } catch (error) {
    console.error('Preference update error:', error)
    res.status(500).json({
      error: 'Failed to update preferences',
      message: error.message
    })
  }
})

// Get user preference profile
app.get('/api/ml/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params

    const profile = await preferenceService.loadProfile(userId)
    const insights = await preferenceService.getPreferenceInsights(userId)

    res.json({
      success: true,
      profile,
      insights
    })
  } catch (error) {
    console.error('Profile fetch error:', error)
    res.status(500).json({
      error: 'Failed to fetch profile',
      message: error.message
    })
  }
})

// Calculate preference score for email
app.post('/api/ml/score-email', async (req, res) => {
  try {
    const { userId, tokens } = req.body

    if (!userId || !tokens) {
      return res.status(400).json({
        error: 'Missing required fields: userId, tokens'
      })
    }

    const score = await preferenceService.calculateEmailScore(userId, tokens)

    res.json({
      success: true,
      score,
      tokens,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Email scoring error:', error)
    res.status(500).json({
      error: 'Failed to score email',
      message: error.message
    })
  }
})

// Rank emails by user preference
app.post('/api/ml/rank-emails', async (req, res) => {
  try {
    const { userId, emails } = req.body

    if (!userId || !emails) {
      return res.status(400).json({
        error: 'Missing required fields: userId, emails'
      })
    }

    if (!Array.isArray(emails)) {
      return res.status(400).json({ error: 'Emails must be an array' })
    }

    // Extract tokens for emails that don't have them
    const emailsWithTokens = await Promise.all(
      emails.map(async (email) => {
        if (!email._tokens) {
          email._tokens = await preferenceService.processEmailTokens(userId, email)
        }
        return email
      })
    )

    const rankedEmails = await preferenceService.rankEmails(userId, emailsWithTokens)

    res.json({
      success: true,
      emails: rankedEmails,
      totalEmails: rankedEmails.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Email ranking error:', error)
    res.status(500).json({
      error: 'Failed to rank emails',
      message: error.message
    })
  }
})

// Test Cerebras connection
app.get('/api/ml/test', async (req, res) => {
  try {
    const result = await cerebrasService.testConnection()
    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Reset user preferences
app.delete('/api/ml/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params

    const success = await preferenceService.resetProfile(userId)

    if (success) {
      res.json({
        success: true,
        message: `Profile reset for user ${userId}`
      })
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to reset profile'
      })
    }
  } catch (error) {
    console.error('Profile reset error:', error)
    res.status(500).json({
      error: 'Failed to reset profile',
      message: error.message
    })
  }
})

// Config endpoint to provide frontend with necessary configuration
app.get('/api/config', (req, res) => {
  res.json({
    features: {
      mockMode: true,
      gmailIntegration: false, // Will be true when server-side Gmail integration is added
      aiClassification: true, // AI features are now available
      mlLearning: true, // Machine learning preference system enabled
    },
    limits: {
      maxEmailsPerRequest: 50,
      maxFileSize: '10MB'
    },
    ml: {
      cerebrasEnabled: !!process.env.CEREBRAS_API_KEY,
      defaultUserId: 'demo-user', // For demo purposes
      endpoints: {
        extractTokens: '/api/ml/extract-tokens',
        updatePreferences: '/api/ml/update-preferences',
        getProfile: '/api/ml/profile/:userId',
        scoreEmail: '/api/ml/score-email',
        rankEmails: '/api/ml/rank-emails',
        test: '/api/ml/test'
      }
    }
  })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 SwipeMail backend server running on http://localhost:${PORT}`)
  console.log(`📧 Mock emails available at http://localhost:${PORT}/api/mock`)
  console.log(`❤️  Health check at http://localhost:${PORT}/health`)
})